"use server";
// Server Actions:申請、簽署條款、檢舉、管理操作
// 所有動作皆:驗證登入/授權(authz.ts)→ 驗證輸入(schemas.ts)→ 執行 → 寫入稽核紀錄
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { currentUser, hasSignedTerms, signTerms, requestIp, logout, currentSession, markSessionStepUp } from "@/server/auth";
import { TERMS_VERSION } from "@/server/terms";
import { createApplication, createPosting, getPosting, updateApplicationStatus } from "@/server/repositories/postings";
import { audit, createReport, resolveReport, getReport } from "@/server/repositories/audit";
import { setProfessorVerify, getProfessor } from "@/server/repositories/professors";
import { notify, markAllRead } from "@/server/repositories/notifications";
import { setPersonaCookie, type Persona } from "@/server/persona";
import {
  requireUser, requireAdmin, requireApplicationStatusEditor, requireConversationMember, requireActiveUser,
  requireOwnProfessorProfile, requireRequestResponder,
} from "@/server/authz";
import {
  applySchema, reportSchema, applicationStatusSchema, reportDecisionSchema,
  professorVerifySchema, personaSchema, sendMessageSchema, startConversationSchema,
  setStatusSchema, addContactSchema, discloseContactSchema, requestApprovalSchema,
  decideApprovalSchema, totpVerifySchema, createSlotsSchema, bookSlotSchema,
  createGroupSchema, inviteMemberSchema, groupPostSchema, suggestTagsSchema,
  summarizeSchema, addSpecialtySchema, createPostingSchema, intakeSettingSchema,
  studentRequestSchema, parseRequestPayload, respondRequestSchema, finalizeRecommendationSchema,
} from "@/server/schemas";
import { REQUEST_TYPES, REQUEST_STATUS_LABELS } from "@/shared/categories";
import {
  getIntakeSetting, upsertIntakeSetting, createStudentRequest, hasActiveRequest,
  respondToRequest, finalizeRecommendation,
} from "@/server/repositories/student-requests";
import {
  getOrCreateConversationForApplication, confirmConversationByApplication, sendMessage,
  setMemberStatus, setUserContact, deleteUserContact, discloseContact, ConversationLimitError,
} from "@/server/repositories/messaging";
import { requestApproval, decideApproval } from "@/server/repositories/dual-approval";
import { logSecurityEvent } from "@/server/repositories/security";
import { generateSecret, getOtpauthUrl, encryptSecret, verifyTotpCode } from "@/server/totp";
import { createSlots, bookSlot, issueIcsToken } from "@/server/repositories/interviews";
import { createGroup, inviteByEmail, createPost as createGroupPost } from "@/server/repositories/groups";
import { suggestSubfieldTags, summarizeMotivation } from "@/server/ai";
import { addProfessorSpecialty, listCandidateSubfieldsForProfessor, getProfessorByUserId as getProfByUserId } from "@/server/repositories/professors";
import { requireSlotManager, requireGroupMember, requireGroupOwner } from "@/server/authz";
import { getApplication as getApp } from "@/server/repositories/postings";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { eq } from "drizzle-orm";

export async function applyAction(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) return { error: "請先登入校內帳號。" };
  if (user.status !== "ACTIVE") {
    return { error: "此帳號目前為唯讀狀態(校友/休學/封存),無法送出新申請。" };
  }
  if (!(await hasSignedTerms(user.id, TERMS_VERSION))) {
    return { error: "請先於「服務條款」頁完成本版本條款簽署,再送出申請。", needTerms: true };
  }
  const parsed = applySchema.safeParse({
    postingId: formData.get("postingId"),
    motivation: formData.get("motivation"),
    payload: formData.get("payload") || "{}",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(parsed.data.payload); } catch { payload = {}; }

  try {
    const app = await createApplication({
      postingId: parsed.data.postingId,
      applicantId: user.id,
      motivation: parsed.data.motivation,
      payload,
    });
    await audit(user.id, "application.create", "APPLICATION", app.id);
    const posting = await getPosting(parsed.data.postingId);
    if (posting?.professor.userId) {
      await notify(posting.professor.userId, "application.new", "收到一則新申請",
        `「${posting.title}」有新的申請,前往查看並比較。`, `/postings/${posting.id}/applications`);
    }
  } catch (e: unknown) {
    // §4.3 fail-closed:對外一律一般化訊息,細節只落在伺服器日誌(e 不外傳)。
    const msg = String(e);
    if (msg.includes("UNIQUE")) return { error: "你已申請過此需求,不可重複申請。" };
    return { error: "送出失敗,請稍後再試。" };
  }
  revalidatePath("/postings");
  return { ok: "申請已送出。教授審核後會更新狀態。" };
}

export async function signTermsAction() {
  const user = await requireUser();
  const ua = headers().get("user-agent") || "";
  await signTerms(user.id, TERMS_VERSION, requestIp(), ua);
  await audit(user.id, "terms.sign", "TERMS", TERMS_VERSION);
  redirect("/postings");
}

export async function logoutAction() {
  await logout();
  redirect("/");
}

export async function reportAction(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) return { error: "請先登入後再檢舉。" };
  const parsed = reportSchema.safeParse({
    targetType: formData.get("targetType"),
    targetId: formData.get("targetId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await createReport(user.id, parsed.data.targetType, parsed.data.targetId, parsed.data.reason);
  await audit(user.id, "report.create", parsed.data.targetType, parsed.data.targetId);
  return { ok: "檢舉已送出。安全疑慮案件將於 48 小時內初步處理,一般案件 7 日內。" };
}

// ── 管理操作(僅 ADMIN,需 2FA;所有動作寫入稽核)─────────────

export async function verifyProfessorAction(formData: FormData) {
  const admin = await requireAdmin("/admin");
  const parsed = professorVerifySchema.safeParse({
    id: formData.get("id"), decision: formData.get("decision"),
  });
  if (!parsed.success) return; // fail-closed:格式不對直接不執行
  const { id, decision } = parsed.data;
  await setProfessorVerify(id, decision);
  await audit(admin.id, `professor.verify.${decision.toLowerCase()}`, "PROFESSOR", id);
  const prof = await getProfessor(id);
  if (prof?.prof.userId) {
    await notify(prof.prof.userId, "professor.verified",
      decision === "APPROVED" ? "你的教授帳號已核准" : "你的教授帳號審核未通過",
      decision === "APPROVED" ? "現在可以發布需求了。" : "如有疑問請聯絡管理員。", "/professor/dashboard");
  }
  revalidatePath("/admin");
}

export async function resolveReportAction(formData: FormData) {
  const admin = await requireAdmin("/admin");
  const parsed = reportDecisionSchema.safeParse({
    id: formData.get("id"), decision: formData.get("decision"),
  });
  if (!parsed.success) return;
  const { id, decision } = parsed.data;
  await resolveReport(id, decision, decision === "resolved" ? "成立" : "不成立");
  await audit(admin.id, `report.${decision}`, "REPORT", id);

  // 對應決策表 #4:結案後雙方皆收到中性通知,不做無聲移除
  const report = await getReport(id);
  if (report) {
    await notify(
      report.reporterId, "report.resolved", "你送出的檢舉已結案",
      decision === "resolved" ? "管理員審查後認定檢舉成立。" : "管理員審查後認定檢舉不成立。",
      "/me/reports",
    );
    if (report.targetType === "USER") {
      await notify(report.targetId, "report.resolved", "有一則與你相關的檢舉已結案",
        "管理員已完成審查,如需說明可聯絡管理員。", "/notifications");
    } else if (report.targetType === "POSTING") {
      const posting = await getPosting(report.targetId);
      if (posting?.professor.userId) {
        await notify(posting.professor.userId, "report.resolved", "有一則與你發布的需求相關的檢舉已結案",
          "管理員已完成審查,如需說明可聯絡管理員。", "/notifications");
      }
    }
  }
  revalidatePath("/admin");
}

// ── 申請狀態管理(教授本人/管理員;§2.2 IDOR 防護 + 狀態白名單)──

export async function updateApplicationStatusAction(formData: FormData) {
  const parsed = applicationStatusSchema.safeParse({
    applicationId: formData.get("applicationId"), status: formData.get("status"),
  });
  if (!parsed.success) return; // fail-closed
  const { applicationId, status } = parsed.data;

  // requireApplicationStatusEditor 刻意排除申請人本人——避免學生自行核准/婉拒自己的申請
  const { user, app, posting } = await requireApplicationStatusEditor(applicationId);
  await updateApplicationStatus(applicationId, status);
  await audit(user.id, "application.status.update", "APPLICATION", applicationId, { status });
  if (status === "accepted") {
    await confirmConversationByApplication(applicationId); // 媒合確認,解除訊息頻率上限
  }

  const statusLabel: Record<string, string> = {
    interview_invited: "已邀請面試", interviewed: "已完成面試", accepted: "審核通過", rejected: "婉拒",
  };
  await notify(
    app.applicantId, "application.status", `你的申請狀態更新:${statusLabel[status] ?? status}`,
    `「${posting.title}」的申請狀態已更新。`, `/me/applications`,
  );
  revalidatePath(`/postings/${app.postingId}/applications`);
}

// ── 身分視角切換(對應決策表 #9;僅影響導覽顯示)──────────────

export async function switchPersonaAction(formData: FormData) {
  const parsed = personaSchema.safeParse({
    persona: formData.get("persona"), back: formData.get("back") || "/",
  });
  if (!parsed.success) return;
  setPersonaCookie(parsed.data.persona as Persona);
  redirect(parsed.data.back);
}

export async function markNotificationsReadAction() {
  const user = await requireUser();
  await markAllRead(user.id);
  revalidatePath("/notifications");
}

// ── 站內訊息系統(架構書 M4)────────────────────────────────

export async function startConversationAction(formData: FormData) {
  const user = await requireActiveUser();
  const parsed = startConversationSchema.safeParse({ applicationId: formData.get("applicationId") });
  if (!parsed.success) redirect("/");

  const { getApplication } = await import("@/server/repositories/postings");
  const app = await getApplication(parsed.data.applicationId);
  if (!app) redirect("/");

  const posting = await getPosting(app.postingId);
  if (!posting?.professor.userId) redirect("/");

  // 只有申請人本人或該需求的教授本人(或管理員)可以開啟這個對話,不透過會 redirect 的守則做流程控制
  const isApplicant = app.applicantId === user.id;
  const isOwner = posting.professor.userId === user.id;
  if (!isApplicant && !isOwner && user.role !== "ADMIN") {
    await logSecurityEvent("authz.denied", "high", user.id, "", { resource: "CONVERSATION_START", applicationId: app.id });
    redirect("/");
  }

  try {
    const conv = await getOrCreateConversationForApplication(app.id, app.applicantId, posting.professor.userId);
    await audit(user.id, "conversation.start", "CONVERSATION", conv.id);
    redirect(`/messages/${conv.id}`);
  } catch (e) {
    if (e instanceof ConversationLimitError) {
      redirect(`/postings/${app.postingId}?msgError=${encodeURIComponent(e.message)}`);
    }
    throw e;
  }
}

export async function sendMessageAction(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) return { error: "請先登入。" };
  if (user.status !== "ACTIVE") return { error: "此帳號目前為唯讀狀態,無法發送訊息。" };
  const parsed = sendMessageSchema.safeParse({
    conversationId: formData.get("conversationId"), body: formData.get("body"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { isConversationMember } = await import("@/server/repositories/messaging");
  const isMember = await isConversationMember(parsed.data.conversationId, user.id);
  if (!isMember) {
    await logSecurityEvent("authz.denied", "high", user.id, "", { resource: "CONVERSATION_SEND", id: parsed.data.conversationId });
    return { error: "無法發送。" };
  }

  await sendMessage(parsed.data.conversationId, user.id, parsed.data.body);
  revalidatePath(`/messages/${parsed.data.conversationId}`);
  return { ok: true };
}

export async function setStatusAction(formData: FormData) {
  const parsed = setStatusSchema.safeParse({
    conversationId: formData.get("conversationId"), status: formData.get("status"), note: formData.get("note") || "",
  });
  if (!parsed.success) return;
  const user = await requireConversationMember(parsed.data.conversationId);
  await setMemberStatus(parsed.data.conversationId, user.id, parsed.data.status, parsed.data.note);
  revalidatePath(`/messages/${parsed.data.conversationId}`);
}

export async function addContactAction(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) return { error: "請先登入。" };
  const parsed = addContactSchema.safeParse({ kind: formData.get("kind"), value: formData.get("value") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await setUserContact(user.id, parsed.data.kind, parsed.data.value);
  await audit(user.id, "contact.add", "USER_CONTACT");
  revalidatePath("/me/contacts");
  return { ok: true };
}

export async function deleteContactAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  await deleteUserContact(id, user.id);
  await audit(user.id, "contact.delete", "USER_CONTACT", id);
  revalidatePath("/me/contacts");
}

export async function discloseContactAction(formData: FormData) {
  const parsed = discloseContactSchema.safeParse({
    conversationId: formData.get("conversationId"), contactId: formData.get("contactId"),
  });
  if (!parsed.success) return;
  const user = await requireActiveUser();
  const isMember = await (await import("@/server/repositories/messaging")).isConversationMember(parsed.data.conversationId, user.id);
  if (!isMember) redirect("/messages");
  await discloseContact(parsed.data.conversationId, user.id, parsed.data.contactId);
  // §3.2 揭露留痕:此動作本身即是稽核事件,獨立於 contactDisclosures 存證表再記一筆業務稽核
  await audit(user.id, "contact.disclose", "CONVERSATION", parsed.data.conversationId);
  revalidatePath(`/messages/${parsed.data.conversationId}`);
}

// ── §2.5 管理員敏感調閱雙人核可 ────────────────────────────

export async function requestApprovalAction(formData: FormData) {
  const admin = await requireAdmin("/admin/approvals");
  const parsed = requestApprovalSchema.safeParse({
    action: formData.get("action"), targetType: formData.get("targetType"), targetId: formData.get("targetId"),
  });
  if (!parsed.success) redirect("/admin/approvals");
  const row = await requestApproval(admin.id, parsed.data.action, parsed.data.targetType, parsed.data.targetId);
  await audit(admin.id, "dual_approval.request", parsed.data.targetType, parsed.data.targetId, { approvalId: row.id });

  // 通知其他管理員有待核可事項(不通知自己)
  const admins = await db.select().from(t.users).where(eq(t.users.role, "ADMIN"));
  for (const other of admins) {
    if (other.id === admin.id) continue;
    await notify(other.id, "approval.pending", "有一則待核可的敏感調閱申請",
      `${admin.displayName} 申請調閱 ${parsed.data.targetType}`, "/admin/approvals");
  }
  redirect("/admin/approvals");
}

export async function decideApprovalAction(formData: FormData) {
  const admin = await requireAdmin("/admin/approvals");
  const parsed = decideApprovalSchema.safeParse({ id: formData.get("id"), decision: formData.get("decision") });
  if (!parsed.success) redirect("/admin/approvals");

  try {
    await decideApproval(parsed.data.id, admin.id, parsed.data.decision);
    await audit(admin.id, `dual_approval.${parsed.data.decision}`, "DUAL_APPROVAL", parsed.data.id);
    await logSecurityEvent("admin.step_up", "low", admin.id, "", { note: `dual_approval ${parsed.data.decision}` });
  } catch (e) {
    // fail-closed:核可失敗(如嘗試自己核可自己)一律記錄安全事件,不靜默吞掉
    await logSecurityEvent("authz.denied", "high", admin.id, "", { resource: "DUAL_APPROVAL", reason: String(e) });
  }
  revalidatePath("/admin/approvals");
}

// ── 帳號生命週期管理(§帳號生命週期,見 lifecycle.ts 檔頭關於偵測/排程的範圍說明)──

async function findUserByEmail(email: string) {
  const [user] = await db.select().from(t.users).where(eq(t.users.email, email.toLowerCase()));
  return user ?? null;
}

export async function markGraduationAction(formData: FormData) {
  const admin = await requireAdmin("/admin/lifecycle");
  const target = await findUserByEmail(String(formData.get("email") || ""));
  if (target) {
    const { markGraduationDetected } = await import("@/server/repositories/lifecycle");
    await markGraduationDetected(target.id, admin.id);
  }
  revalidatePath("/admin/lifecycle");
}

export async function runLifecycleBatchAction() {
  const admin = await requireAdmin("/admin/lifecycle");
  const { processLifecycleTransitions } = await import("@/server/repositories/lifecycle");
  const result = await processLifecycleTransitions();
  await audit(admin.id, "lifecycle.batch_run", "", "", result);
  revalidatePath("/admin/lifecycle");
}

export async function suspendAccountAction(formData: FormData) {
  const admin = await requireAdmin("/admin/lifecycle");
  const target = await findUserByEmail(String(formData.get("email") || ""));
  if (target) {
    const { suspendAccount } = await import("@/server/repositories/lifecycle");
    await suspendAccount(target.id, admin.id, String(formData.get("reason") || ""));
  }
  revalidatePath("/admin/lifecycle");
}

export async function restoreAccountAction(formData: FormData) {
  const admin = await requireAdmin("/admin/lifecycle");
  const target = await findUserByEmail(String(formData.get("email") || ""));
  if (target) {
    const { restoreAccount } = await import("@/server/repositories/lifecycle");
    await restoreAccount(target.id, admin.id).catch(() => {}); // 若非 SUSPENDED 狀態,安靜略過(前端未強制檢查現況)
  }
  revalidatePath("/admin/lifecycle");
}

export async function archiveAccountAction(formData: FormData) {
  const admin = await requireAdmin("/admin/lifecycle");
  const target = await findUserByEmail(String(formData.get("email") || ""));
  if (target) {
    const { archiveAccount } = await import("@/server/repositories/lifecycle");
    await archiveAccount(target.id, admin.id, String(formData.get("reason") || ""));
  }
  revalidatePath("/admin/lifecycle");
}

export async function initiateRelinquishmentAction(formData: FormData) {
  const admin = await requireAdmin("/admin/lifecycle");
  const professorId = String(formData.get("professorId") || "");
  const days = Number(formData.get("days") || 30);
  const reason = String(formData.get("reason") || "");
  const { initiateRelinquishment } = await import("@/server/repositories/lifecycle");
  await initiateRelinquishment(professorId, admin.id, days, reason).catch(() => {}); // 表單已限制 30–90,失敗多半是查無此教授
  revalidatePath("/admin/lifecycle");
}

export async function cancelRelinquishmentAction(formData: FormData) {
  const admin = await requireAdmin("/admin/lifecycle");
  const id = String(formData.get("id") || "");
  const { cancelRelinquishment } = await import("@/server/repositories/lifecycle");
  await cancelRelinquishment(id, admin.id);
  revalidatePath("/admin/lifecycle");
}

// ── M7 面試時段預約 + ics 行事曆同步 ────────────────────────

export async function createSlotsAction(formData: FormData) {
  const parsed = createSlotsSchema.safeParse({
    postingId: formData.get("postingId"), startAt: formData.get("startAt"),
    endAt: formData.get("endAt"), location: formData.get("location") || "",
  });
  if (!parsed.success) return;
  const user = await requireSlotManager(parsed.data.postingId);
  const posting = await getPosting(parsed.data.postingId);
  // 面試時段僅適用教授發起的需求(見 postings/[id]/applications/page.tsx 的 UI 限制);
  // 這裡是伺服器端的第二層把關,防止有人繞過前端直接對單位/學生發起的需求造出時段。
  if (!posting || posting.posterType !== "PROFESSOR" || !posting.professorId) return;
  await createSlots(parsed.data.postingId, posting.professorId, [{
    startAt: new Date(parsed.data.startAt), endAt: new Date(parsed.data.endAt), location: parsed.data.location,
  }]);
  await audit(user.id, "interview_slot.create", "POSTING", parsed.data.postingId);
  revalidatePath(`/postings/${parsed.data.postingId}`);
}

export async function bookSlotAction(formData: FormData) {
  const user = await requireActiveUser();
  const parsed = bookSlotSchema.safeParse({ slotId: formData.get("slotId"), applicationId: formData.get("applicationId") });
  if (!parsed.success) return;
  const app = await getApp(parsed.data.applicationId);
  if (!app || app.applicantId !== user.id) return; // 只能替自己的申請預約

  const result = await bookSlot(parsed.data.slotId, parsed.data.applicationId);
  if (!result) {
    // 時段已被搶先預約(原子條件更新失敗),不視為系統錯誤,只是正常的併發結果
    revalidatePath(`/postings/${app.postingId}`);
    return;
  }
  await audit(user.id, "interview_slot.book", "INTERVIEW_SLOT", result.id);
  const posting = await getPosting(app.postingId);
  if (posting?.professor.userId) {
    await notify(posting.professor.userId, "interview_slot.booked", "有人預約了面試時段",
      `「${posting.title}」的一個面試時段已被預約。`, `/postings/${posting.id}/applications`);
  }
  revalidatePath(`/postings/${app.postingId}`);
}

export async function getIcsLinkAction() {
  const user = await requireUser();
  const token = await issueIcsToken(user.id);
  await audit(user.id, "ics.token_issued");
  redirect(`/api/calendar/${token}`);
}

// ── M8 教授實驗室/計畫團隊群組(貼文一律不公開)────────────────

export async function createGroupAction(formData: FormData) {
  const user = await requireActiveUser();
  const parsed = createGroupSchema.safeParse({ name: formData.get("name"), description: formData.get("description") || "" });
  if (!parsed.success) redirect("/groups");
  const group = await createGroup(user.id, parsed.data.name, parsed.data.description);
  await audit(user.id, "group.create", "GROUP", group.id);
  redirect(`/groups/${group.id}`);
}

export async function inviteMemberAction(formData: FormData) {
  const parsed = inviteMemberSchema.safeParse({ groupId: formData.get("groupId"), email: formData.get("email") });
  if (!parsed.success) return;
  const user = await requireGroupOwner(parsed.data.groupId);
  const ok = await inviteByEmail(parsed.data.groupId, parsed.data.email);
  if (ok) await audit(user.id, "group.invite", "GROUP", parsed.data.groupId, { email: parsed.data.email });
  revalidatePath(`/groups/${parsed.data.groupId}`);
}

export async function createGroupPostAction(formData: FormData) {
  const parsed = groupPostSchema.safeParse({ groupId: formData.get("groupId"), body: formData.get("body") });
  if (!parsed.success) return;
  const user = await requireGroupMember(parsed.data.groupId);
  if (user.status !== "ACTIVE") return; // 唯讀帳號不可發文
  await createGroupPost(parsed.data.groupId, user.id, parsed.data.body);
  revalidatePath(`/groups/${parsed.data.groupId}`);
}

// ── AI 輔助(建議只能由教授手動確認後套用,絕不自動寫入)────────

export async function suggestTagsAction(_prev: { tags: string[]; candidateMap?: Record<string, string> }, formData: FormData) {
  const parsed = suggestTagsSchema.safeParse({ professorId: formData.get("professorId") });
  if (!parsed.success) return { tags: [] as string[] };
  const user = await requireUser();
  const [prof] = await db.select().from(t.professorProfiles).where(eq(t.professorProfiles.id, parsed.data.professorId));
  if (!prof || (prof.userId !== user.id && user.role !== "ADMIN")) return { tags: [] as string[] };

  const candidates = await listCandidateSubfieldsForProfessor(parsed.data.professorId);
  const tags = await suggestSubfieldTags(prof.bio, candidates.map((c) => c.name));
  return { tags, candidateMap: Object.fromEntries(candidates.map((c) => [c.name, c.id])) };
}

export async function addSpecialtyAction(formData: FormData) {
  const parsed = addSpecialtySchema.safeParse({ professorId: formData.get("professorId"), subfieldId: formData.get("subfieldId") });
  if (!parsed.success) return;
  const user = await requireUser();
  const [prof] = await db.select().from(t.professorProfiles).where(eq(t.professorProfiles.id, parsed.data.professorId));
  if (!prof || (prof.userId !== user.id && user.role !== "ADMIN")) return;
  await addProfessorSpecialty(parsed.data.professorId, parsed.data.subfieldId);
  await audit(user.id, "professor.specialty.add_via_ai_suggestion", "PROFESSOR", parsed.data.professorId, { subfieldId: parsed.data.subfieldId });
  revalidatePath("/professor/dashboard");
}

export async function summarizeApplicationAction(formData: FormData) {
  const parsed = summarizeSchema.safeParse({ applicationId: formData.get("applicationId") });
  if (!parsed.success) return;
  const { user, posting } = await requireApplicationStatusEditor(parsed.data.applicationId);
  const app = await getApp(parsed.data.applicationId);
  if (!app) return;
  const summary = await summarizeMotivation(app.motivation);
  await db.update(t.applications).set({ motivationSummary: summary }).where(eq(t.applications.id, app.id));
  await audit(user.id, "application.ai_summarize", "APPLICATION", app.id);
  revalidatePath(`/postings/${posting.id}/applications`);
}

// ── §6 檔案下載(時效簽名連結核發)──────────────────────────

export async function requestFileLinkAction(formData: FormData) {
  const attachmentId = String(formData.get("attachmentId"));
  const { requireAttachmentAccess } = await import("@/server/authz");
  const { user } = await requireAttachmentAccess(attachmentId);
  const { createDownloadToken } = await import("@/server/repositories/attachments");
  const token = await createDownloadToken(attachmentId);
  await audit(user.id, "attachment.download_link_issued", "ATTACHMENT", attachmentId);
  redirect(`/api/files/download/${token}`);
}

// ── §2.5 管理員雙因素驗證(啟用 + 重驗)────────────────────
// 這兩個動作刻意不經過 requireAdmin()(會造成導向迴圈,setup/step-up 本身就是
// requireAdmin 導向的目的地),改為直接檢查 role,但一樣是 fail-closed。

export async function setupTotpAction(formData: FormData) {
  const user = await currentUser();
  if (!user || user.role !== "ADMIN") redirect("/");
  const next = String(formData.get("next") || "/admin");
  const secret = String(formData.get("secret") || "");
  const parsed = totpVerifySchema.safeParse({ code: formData.get("code") });

  if (!secret || !parsed.success) {
    redirect(`/admin/setup-2fa?next=${encodeURIComponent(next)}`);
  }

  const encSecret = encryptSecret(secret);
  const ok = verifyTotpCode(encSecret, parsed.data.code);
  if (!ok) {
    await logSecurityEvent("admin.step_up", "medium", user.id, "", { result: "setup_failed" });
    redirect(`/admin/setup-2fa?next=${encodeURIComponent(next)}&error=1`);
  }

  await db.update(t.users).set({ totpSecretEnc: encSecret, totpEnabled: true }).where(eq(t.users.id, user.id));
  await audit(user.id, "admin.2fa.enabled");
  const session = await currentSession();
  if (session) await markSessionStepUp(session.id);
  redirect(next);
}

export async function stepUpTotpAction(formData: FormData) {
  const user = await currentUser();
  if (!user || user.role !== "ADMIN" || !user.totpSecretEnc) redirect("/");
  const next = String(formData.get("next") || "/admin");
  const parsed = totpVerifySchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) {
    redirect(`/admin/step-up?next=${encodeURIComponent(next)}`);
  }

  const ok = verifyTotpCode(user.totpSecretEnc, parsed.data.code);
  if (!ok) {
    await logSecurityEvent("admin.step_up", "medium", user.id, "", { result: "failed" });
    redirect(`/admin/step-up?next=${encodeURIComponent(next)}&error=1`);
  }
  const session = await currentSession();
  if (session) await markSessionStepUp(session.id);
  await logSecurityEvent("admin.step_up", "low", user.id, "", { result: "ok" });
  redirect(next);
}

// ── 白皮書 2.1 二維模型:教授/單位發布新需求(2026-08 新增)──────────────
// 先前版本只有種子資料建立的示範需求,教授端沒有實際發布介面;此為補上的發布入口。

export async function createPostingAction(_prev: unknown, formData: FormData) {
  const { user, professorId } = await requireOwnProfessorProfile();
  const parsed = createPostingSchema.safeParse({
    category: formData.get("category"), title: formData.get("title"), description: formData.get("description"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const posting = await createPosting({ posterType: "PROFESSOR", professorId, ...parsed.data });
  await audit(user.id, "posting.create", "POSTING", posting.id, { category: parsed.data.category });
  revalidatePath("/postings");
  revalidatePath("/professor/dashboard");
  redirect(`/postings/${posting.id}`);
}

// ── 白皮書 2.3.1「可受理的學生請求」五項設定區(2026-08 新增)────────────
// 技術原則(白皮書明文):五項開關由同一支函式帶不同參數處理,故此處只有一個 action,
// 靠表單裡的 type 欄位分流,不為五項各寫一支。

export async function updateIntakeSettingAction(formData: FormData) {
  const { user, professorId } = await requireOwnProfessorProfile();
  const parsed = intakeSettingSchema.safeParse({
    type: formData.get("type"),
    enabled: formData.get("enabled") ? "on" : "off",
    conditionText: formData.get("conditionText") || "",
    quotaNote: formData.get("quotaNote") || "",
  });
  if (!parsed.success) return;
  await upsertIntakeSetting(professorId, parsed.data.type, {
    enabled: parsed.data.enabled, conditionText: parsed.data.conditionText, quotaNote: parsed.data.quotaNote,
  });
  await audit(user.id, "intake_setting.update", "PROFESSOR", professorId, { type: parsed.data.type, enabled: parsed.data.enabled });
  revalidatePath("/professor/dashboard");
}

// ── 白皮書 2.9 推薦信 / 2.10 大專生計畫等「學生 → 教授」請求(2026-08 新增)────
// 與 applyAction(學生應徵教授/單位廣播的需求)方向相反:這裡是學生主動對「特定教授」
// 提出請求。三道防線與 applyAction 對齊:登入 → 帳號非唯讀 → 已簽署當版條款。

export async function submitStudentRequestAction(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) return { error: "請先登入校內帳號。" };
  if (user.status !== "ACTIVE") {
    return { error: "此帳號目前為唯讀狀態(校友/休學/封存),無法送出新請求。" };
  }
  if (!(await hasSignedTerms(user.id, TERMS_VERSION))) {
    return { error: "請先於「服務條款」頁完成本版本條款簽署,再送出請求。", needTerms: true };
  }
  const parsed = studentRequestSchema.safeParse({
    professorId: formData.get("professorId"), type: formData.get("type"), payload: formData.get("payload") || "{}",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // fail-closed:即使前端隱藏了關閉的項目,伺服器端仍重新核對教授是否真的開放此類型
  const setting = await getIntakeSetting(parsed.data.professorId, parsed.data.type);
  if (!setting?.enabled) return { error: "此教授目前未開放此類型的請求。" };

  let rawPayload: Record<string, unknown> = {};
  try { rawPayload = JSON.parse(parsed.data.payload); } catch { rawPayload = {}; }
  const payloadParsed = parseRequestPayload(parsed.data.type, rawPayload);
  if (!payloadParsed.success) return { error: payloadParsed.error.issues[0].message };

  if (await hasActiveRequest(user.id, parsed.data.professorId, parsed.data.type)) {
    return { error: "你已對這位教授提出過此類型的請求,待現有請求結案後才能再次發起。" };
  }

  const row = await createStudentRequest({
    type: parsed.data.type, studentId: user.id, professorId: parsed.data.professorId, payload: payloadParsed.data,
  });
  await audit(user.id, "student_request.create", "STUDENT_REQUEST", row.id, { type: parsed.data.type });

  const prof = await getProfessor(parsed.data.professorId);
  if (prof?.prof.userId) {
    await notify(prof.prof.userId, "student_request.new", "收到一則新的學生請求",
      `類型:${REQUEST_TYPES[parsed.data.type]},前往查看並回應。`, "/professor/dashboard");
  }
  revalidatePath("/professor/dashboard");
  return { ok: "請求已送出,教授回應後會通知你。" };
}

export async function respondToRequestAction(formData: FormData) {
  const parsed = respondRequestSchema.safeParse({
    requestId: formData.get("requestId"), decision: formData.get("decision"),
  });
  if (!parsed.success) return;
  // requireRequestResponder 刻意排除發起請求的學生本人,同 requireApplicationStatusEditor 的道理。
  const { user, request } = await requireRequestResponder(parsed.data.requestId);
  try {
    const updated = await respondToRequest(parsed.data.requestId, parsed.data.decision);
    await audit(user.id, `student_request.${parsed.data.decision}`, "STUDENT_REQUEST", parsed.data.requestId);
    await notify(request.studentId, "student_request.status",
      `你的請求狀態更新:${REQUEST_STATUS_LABELS[updated.status] ?? updated.status}`,
      `「${REQUEST_TYPES[request.type]}」的請求狀態已更新。`, "/me/requests");
  } catch (e) {
    // fail-closed:非法狀態轉換(如已回應過又再次回應)一律記錄,不靜默吞掉
    await logSecurityEvent("authz.denied", "low", user.id, "", { resource: "STUDENT_REQUEST_RESPOND", reason: String(e) });
  }
  revalidatePath("/professor/dashboard");
}

/** 白皮書 2.9:推薦信專屬的「撰寫中 → 已送出 / 了解後婉拒」。其餘三類請求沒有這個中介狀態。 */
export async function finalizeRecommendationAction(formData: FormData) {
  const parsed = finalizeRecommendationSchema.safeParse({
    requestId: formData.get("requestId"), outcome: formData.get("outcome"),
  });
  if (!parsed.success) return;
  const { user, request } = await requireRequestResponder(parsed.data.requestId);
  try {
    const updated = await finalizeRecommendation(parsed.data.requestId, parsed.data.outcome);
    await audit(user.id, `student_request.${parsed.data.outcome}`, "STUDENT_REQUEST", parsed.data.requestId);
    await notify(request.studentId, "student_request.status",
      `你的推薦信請求狀態更新:${REQUEST_STATUS_LABELS[updated.status] ?? updated.status}`,
      "教授已更新推薦信撰寫進度。", "/me/requests");
  } catch (e) {
    await logSecurityEvent("authz.denied", "low", user.id, "", { resource: "STUDENT_REQUEST_FINALIZE", reason: String(e) });
  }
  revalidatePath("/professor/dashboard");
}
