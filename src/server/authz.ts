// 集中式授權守則(§2.1、§2.2)
// ─────────────────────────────────────────────────────────────
// 規則:任何涉及非公開資源的 Server Action / 頁面,一律呼叫本檔案的函式做授權判斷,
// 不得在各處自行寫 if 判斷散落各地——OWASP A01 權限控管失效連年居首,根因正是
// 授權邏輯分散、容易漏判。新功能只要呼叫既有守則,不會各自重造輪子而留下破口。
//
// fail-closed 原則:任何判斷過程拋出例外,一律視為「拒絕」,不得因錯誤而放行
// (對應 §4.3、§10 原則 3)。
import { redirect } from "next/navigation";
import { currentUser, currentSession } from "@/server/auth";
import { getApplication } from "@/server/repositories/postings";
import { getPosting } from "@/server/repositories/postings";
import { logSecurityEvent } from "@/server/repositories/security";

const STEP_UP_VALID_MS = 30 * 60_000; // §2.5:敏感操作重驗有效期 30 分鐘

export type AuthedUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

export async function requireUser(): Promise<AuthedUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** §帳號生命週期:唯讀狀態(ALUM/SUSPENDED/ARCHIVED)可以登入、可以瀏覽,
 *  但不能執行任何會「新增/變更資料」的動作——這支函式是那道界線實際被畫的地方。
 *  凡是申請、發訊息、發起對話、上傳附件、揭露聯絡方式等動作,一律先呼叫此函式。 */
export async function requireActiveUser(): Promise<AuthedUser> {
  const user = await requireUser();
  if (user.status !== "ACTIVE") {
    await logSecurityEvent("authz.denied", "low", user.id, "", { resource: "WRITE_ACTION", accountStatus: user.status });
    redirect("/?readOnlyNotice=1");
  }
  return user;
}

export async function requireAdmin(next = "/admin"): Promise<AuthedUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    await logSecurityEvent("authz.denied", "medium", user.id, "", { need: "ADMIN", have: user.role });
    redirect("/");
  }
  // §2.5:管理員帳號強制雙因素驗證。未啟用 → 導去設定;已啟用但超過重驗時效 → 導去重驗。
  if (!user.totpEnabled) {
    redirect(`/admin/setup-2fa?next=${encodeURIComponent(next)}`);
  }
  const session = await currentSession();
  const fresh = session?.stepUpAt && Date.now() - session.stepUpAt.getTime() < STEP_UP_VALID_MS;
  if (!fresh) {
    redirect(`/admin/step-up?next=${encodeURIComponent(next)}`);
  }
  return user;
}

/** 需求(posting)的擁有者(該需求所屬教授本人)或管理員,才能操作該需求相關資源。 */
export async function canOperatePosting(userId: string, postingId: string): Promise<boolean> {
  try {
    const posting = await getPosting(postingId);
    if (!posting) return false;
    // posterUserId 統一解析「這則需求由哪個 users.id 管理」,不論發起方是教授/單位/學生
    // (白皮書2.1 二維模型 2026-08 第二輪起支援三種發起方,見 repositories/postings.ts)。
    return posting.posterUserId === userId;
  } catch {
    return false; // fail-closed
  }
}

export async function requirePostingOwner(postingId: string) {
  const user = await requireUser();
  if (user.role === "ADMIN") return user;
  const ok = await canOperatePosting(user.id, postingId);
  if (!ok) {
    await logSecurityEvent("authz.denied", "high", user.id, "", { resource: "POSTING", id: postingId });
    redirect("/");
  }
  return user;
}

/** 申請(application)只有申請人本人、該需求教授、或管理員可查看/操作(§2.2 IDOR 防護)。 */
export async function requireApplicationAccess(applicationId: string) {
  const user = await requireUser();
  const app = await getApplication(applicationId);
  if (!app) redirect("/");
  if (user.role === "ADMIN" || app.applicantId === user.id) return { user, app };
  const isOwner = await canOperatePosting(user.id, app.postingId);
  if (!isOwner) {
    await logSecurityEvent("authz.denied", "high", user.id, "", { resource: "APPLICATION", id: applicationId });
    redirect("/");
  }
  return { user, app };
}

/** 變更申請狀態專用守則:刻意只允許該需求教授本人或管理員,**不含申請人自己**——
 *  否則等於讓學生能自行核准/婉拒自己的申請,是比一般 IDOR 更嚴重的邏輯層授權漏洞。 */
export async function requireApplicationStatusEditor(applicationId: string) {
  const user = await requireUser();
  const app = await getApplication(applicationId);
  if (!app) redirect("/");
  const posting = await getPosting(app.postingId);
  if (!posting) redirect("/");
  const isOwner = posting.professor.userId === user.id;
  if (!isOwner && user.role !== "ADMIN") {
    await logSecurityEvent("authz.denied", "high", user.id, "", {
      resource: "APPLICATION_STATUS", id: applicationId, note: "非需求擁有者嘗試變更申請狀態",
    });
    redirect("/");
  }
  return { user, app, posting };
}

/** 教授檔案本人或管理員(用於教授自行編輯檔案等未來功能)。 */
export async function requireProfessorSelf(professorUserId: string | null) {
  const user = await requireUser();
  if (user.role === "ADMIN") return user;
  if (professorUserId !== user.id) {
    await logSecurityEvent("authz.denied", "medium", user.id, "", { resource: "PROFESSOR_SELF" });
    redirect("/");
  }
  return user;
}

/** 對話只有成員本人可存取;非成員一律導回首頁,不透露對話是否存在(§2.2 延伸)。 */
export async function requireConversationMember(conversationId: string) {
  const user = await requireUser();
  const { isConversationMember } = await import("@/server/repositories/messaging");
  const ok = await isConversationMember(conversationId, user.id);
  if (!ok) {
    await logSecurityEvent("authz.denied", "high", user.id, "", { resource: "CONVERSATION", id: conversationId });
    redirect("/messages");
  }
  return user;
}

/** 附件只有上傳者本人、該申請對應需求的教授、或管理員可存取(§2.2、§6)。 */
export async function requireAttachmentAccess(attachmentId: string) {
  const user = await requireUser();
  const { getAttachment } = await import("@/server/repositories/attachments");
  const att = await getAttachment(attachmentId);
  if (!att) redirect("/");
  if (att.ownerId === user.id || user.role === "ADMIN") return { user, att };
  if (att.applicationId) {
    const isOwner = await canOperatePosting(user.id, (await getApplication(att.applicationId))?.postingId ?? "");
    if (isOwner) return { user, att };
  }
  await logSecurityEvent("authz.denied", "high", user.id, "", { resource: "ATTACHMENT", id: attachmentId });
  redirect("/");
}

/** 面試時段只有該需求的教授本人(或管理員)可開放/管理。 */
export async function requireSlotManager(postingId: string) {
  const user = await requireUser();
  if (user.role === "ADMIN") return user;
  const ok = await canOperatePosting(user.id, postingId);
  if (!ok) {
    await logSecurityEvent("authz.denied", "high", user.id, "", { resource: "INTERVIEW_SLOT", postingId });
    redirect("/");
  }
  return user;
}

/** 群組只有成員可存取內容;非成員一律導回群組列表,不透露群組是否存在。 */
export async function requireGroupMember(groupId: string) {
  const user = await requireUser();
  const { isGroupMember } = await import("@/server/repositories/groups");
  const ok = await isGroupMember(groupId, user.id);
  if (!ok) {
    await logSecurityEvent("authz.denied", "high", user.id, "", { resource: "GROUP", id: groupId });
    redirect("/groups");
  }
  return user;
}

/** 群組管理動作(邀請成員等)僅群組擁有者。 */
export async function requireGroupOwner(groupId: string) {
  const user = await requireUser();
  const { getGroup } = await import("@/server/repositories/groups");
  const group = await getGroup(groupId);
  if (!group || (group.ownerId !== user.id && user.role !== "ADMIN")) {
    await logSecurityEvent("authz.denied", "high", user.id, "", { resource: "GROUP_OWNER", id: groupId });
    redirect("/groups");
  }
  return user;
}

// ── 白皮書 2.1/2.3.1/2.9/2.10:教授端「可受理的學生請求」與學生請求(2026-08 新增)──

async function isProfessorAccountOwner(userId: string, professorId: string): Promise<boolean> {
  try {
    const { getProfessor } = await import("@/server/repositories/professors");
    const data = await getProfessor(professorId);
    return !!data && data.prof.userId === userId;
  } catch {
    return false; // fail-closed
  }
}

/** 教授本人的教授檔案(用於發布需求、設定「可受理的學生請求」等僅教授本人可做的動作)。
 *  刻意不讓 ADMIN 略過——這些是「代表某位教授」的動作,管理員沒有對應的教授身分可代入。 */
export async function requireOwnProfessorProfile() {
  const user = await requireActiveUser();
  const { getProfessorByUserId } = await import("@/server/repositories/professors");
  const prof = await getProfessorByUserId(user.id);
  if (!prof) {
    await logSecurityEvent("authz.denied", "medium", user.id, "", { resource: "PROFESSOR_PROFILE_SELF" });
    redirect("/professor/dashboard");
  }
  return { user, professorId: prof.id };
}

/** 請求(student_requests)只有發起的學生本人、該教授本人、或管理員可查看(比照 requireApplicationAccess)。 */
export async function requireRequestParticipant(requestId: string) {
  const user = await requireUser();
  const { getStudentRequest } = await import("@/server/repositories/student-requests");
  const reqRow = await getStudentRequest(requestId);
  if (!reqRow) redirect("/");
  if (user.role === "ADMIN" || reqRow.studentId === user.id) return { user, request: reqRow };
  const isOwner = await isProfessorAccountOwner(user.id, reqRow.professorId);
  if (!isOwner) {
    await logSecurityEvent("authz.denied", "high", user.id, "", { resource: "STUDENT_REQUEST", id: requestId });
    redirect("/");
  }
  return { user, request: reqRow };
}

/** 回應請求(接受/婉拒/希望先談談/撰寫完成)專用守則:只允許該教授本人或管理員,
 *  刻意排除發起請求的學生自己——與 requireApplicationStatusEditor 同一道理:不能自己核准自己。 */
export async function requireRequestResponder(requestId: string) {
  const user = await requireUser();
  const { getStudentRequest } = await import("@/server/repositories/student-requests");
  const reqRow = await getStudentRequest(requestId);
  if (!reqRow) redirect("/");
  const isOwner = await isProfessorAccountOwner(user.id, reqRow.professorId);
  if (!isOwner && user.role !== "ADMIN") {
    await logSecurityEvent("authz.denied", "high", user.id, "", {
      resource: "STUDENT_REQUEST_RESPOND", id: requestId, note: "非該教授本人嘗試回應學生請求",
    });
    redirect("/");
  }
  return { user, request: reqRow };
}
