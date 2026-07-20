"use server";
// Server Actions:申請、簽署條款、檢舉、管理操作
// 所有動作皆:驗證登入/授權(authz.ts)→ 驗證輸入(schemas.ts)→ 執行 → 寫入稽核紀錄
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { currentUser, hasSignedTerms, signTerms, requestIp, logout, currentSession, markSessionStepUp } from "@/server/auth";
import { TERMS_VERSION } from "@/server/terms";
import { createApplication, getPosting, updateApplicationStatus } from "@/server/repositories/postings";
import { audit, createReport, resolveReport, getReport } from "@/server/repositories/audit";
import { setProfessorVerify, getProfessor } from "@/server/repositories/professors";
import { notify, markAllRead } from "@/server/repositories/notifications";
import { setPersonaCookie, type Persona } from "@/server/persona";
import { requireUser, requireAdmin, requireApplicationStatusEditor, requireConversationMember } from "@/server/authz";
import {
  applySchema, reportSchema, applicationStatusSchema, reportDecisionSchema,
  professorVerifySchema, personaSchema, sendMessageSchema, startConversationSchema,
  setStatusSchema, addContactSchema, discloseContactSchema,
} from "@/server/schemas";
import {
  getOrCreateConversationForApplication, confirmConversationByApplication, sendMessage,
  setMemberStatus, setUserContact, deleteUserContact, discloseContact, ConversationLimitError,
} from "@/server/repositories/messaging";
import { logSecurityEvent } from "@/server/repositories/security";
import { generateSecret, getOtpauthUrl, encryptSecret, verifyTotpCode } from "@/server/totp";
import { totpVerifySchema } from "@/server/schemas";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { eq } from "drizzle-orm";

export async function applyAction(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) return { error: "請先登入校內帳號。" };
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
  const user = await requireUser();
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
  const user = await requireConversationMember(parsed.data.conversationId);
  await discloseContact(parsed.data.conversationId, user.id, parsed.data.contactId);
  // §3.2 揭露留痕:此動作本身即是稽核事件,獨立於 contactDisclosures 存證表再記一筆業務稽核
  await audit(user.id, "contact.disclose", "CONVERSATION", parsed.data.conversationId);
  revalidatePath(`/messages/${parsed.data.conversationId}`);
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
