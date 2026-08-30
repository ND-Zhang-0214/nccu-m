// 集中式授權守則(§2.1、§2.2)
// ─────────────────────────────────────────────────────────────
// 規則:任何涉及非公開資源的 Server Action / 頁面,一律呼叫本檔案的函式做授權判斷,
// 不得在各處自行寫 if 判斷散落各地——OWASP A01 權限控管失效連年居首,根因正是
// 授權邏輯分散、容易漏判。新功能只要呼叫既有守則,不會各自重造輪子而留下破口。
//
// fail-closed 原則:任何判斷過程拋出例外,一律視為「拒絕」,不得因錯誤而放行
// (對應 §4.3、§10 原則 3)。
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { currentUser, currentSession, isSafeNextPath } from "@/server/auth";
import { getApplication } from "@/server/repositories/postings";
import { getPosting } from "@/server/repositories/postings";
import { logSecurityEvent } from "@/server/repositories/security";

const STEP_UP_VALID_MS = 30 * 60_000; // §2.5:敏感操作重驗有效期 30 分鐘

export type AuthedUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

export async function requireUser(): Promise<AuthedUser> {
  const user = await currentUser();
  if (!user) {
    // middleware.ts 會把目前路徑(含 query string)寫進 x-pathname 這個請求標頭轉發下來——
    // Next.js App Router 沒有提供在任意伺服器端函式內讀取「目前網址」的公開 API,這是
    // 官方文件認可的標準繞道(middleware 轉發自訂請求標頭,伺服器端用 headers() 讀回,
    // 與同一支 middleware 裡 CSP nonce 的轉發是同一套機制)。讀不到或格式不安全就退回
    // 不帶 next 的陽春版:寧可少一段「登入後跳回原頁」的體驗,也不要把未經驗證的字串
    // 直接餵進 redirect()。
    // 註:大部分匿名訪客會先被 middleware 用「cookie 存不存在」擋下(直接帶 next 導去
    // /login,見 middleware.ts)。會走到這裡的是「cookie 存在但 session 已失效」
    // (閒置/絕對逾時、被強制登出等)這種 middleware 因跑在 Edge runtime、無法查資料庫
    // 而篩不掉的情況——屬於第二層權威複查(defense-in-depth,兩層各司其職)。
    const path = headers().get("x-pathname");
    redirect(isSafeNextPath(path) ? `/login?next=${encodeURIComponent(path)}` : "/login");
  }
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

/** 編輯歷史(白皮書 2.8.2):僅需求擁有者、已對此需求提出申請者、或管理員可查看完整編輯
 *  歷史——頁面本身的「當前內容」一般瀏覽者都看得到,這支函式只把關「歷史」這條路徑。
 *  白皮書原文表格與其自身理由段落互相矛盾(表格寫一般瀏覽者也可查詢),交付文件已誠實
 *  列出此落差,程式碼採信理由段落(較嚴謹的一方),與 getPostingVersions() 的註解一致。 */
export async function requirePostingHistoryViewer(postingId: string) {
  const user = await requireUser();
  if (user.role === "ADMIN") return user;
  const isOwner = await canOperatePosting(user.id, postingId);
  if (isOwner) return user;
  const { getMyApplicationForPosting } = await import("@/server/repositories/postings");
  const myApp = await getMyApplicationForPosting(postingId, user.id);
  if (!myApp) {
    await logSecurityEvent("authz.denied", "medium", user.id, "", { resource: "POSTING_HISTORY", id: postingId });
    redirect("/");
  }
  return user;
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
  // 修正:原本寫 posting.professor.userId,單位/學生發起的需求 professor 為 null 會直接
  // 丟例外(fail-closed 之下會變成一律拒絕,雖不算授權漏洞,但會讓單位/學生發起需求的
  // 申請狀態功能整個壞掉)——統一改用 posterUserId,同 canOperatePosting 的作法。
  const isOwner = posting.posterUserId === user.id;
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

/** 附件只有上傳者本人、該申請對應需求的教授、群組檔案的同群組成員、或管理員可存取(§2.2、§6、白皮書 2.7.2)。 */
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
  // 白皮書 2.7.2:群組共用檔案「成員可下載與刪除」——不限上傳者本人,同群組任一成員皆可。
  if (att.groupId) {
    const { isGroupMember } = await import("@/server/repositories/groups");
    if (await isGroupMember(att.groupId, user.id)) return { user, att };
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

// ── 白皮書 2.5:單位帳號(2026-08 第二輪新增)──────────────────────────

/** 單位本人的單位檔案(用於發布職缺等僅該單位帳號本人可做的動作),比照
 *  requireOwnProfessorProfile 的寫法——刻意不讓 ADMIN 略過,理由相同:
 *  這是「代表某個單位」的動作,管理員沒有對應的單位身分可代入。 */
export async function requireOwnUnitProfile() {
  const user = await requireActiveUser();
  const { getUnitByUserId } = await import("@/server/repositories/units");
  const unit = await getUnitByUserId(user.id);
  if (!unit) {
    await logSecurityEvent("authz.denied", "medium", user.id, "", { resource: "UNIT_PROFILE_SELF" });
    redirect("/");
  }
  return { user, unitId: unit.id };
}

/** 白皮書 2.5.2 單位帳號權限範圍——「不可:瀏覽教授資料、發起研究媒合」。後者已經因為
 *  單位帳號沒有 professorProfiles 而自然被 requireOwnProfessorProfile 擋下,這支函式
 *  補上前者:凡是教授目錄/教授頁面一律呼叫,擋單位帳號。
 *
 *  白皮書 2.11.4「登入門檻前移」上線後(2026-08 第二輪):教授目錄本來就屬於「所有教授
 *  資料」,是全站登入化清單明文列出的項目,這裡改用 requireUser() 而非 currentUser(),
 *  順勢由這支既有的目錄守則一併把關,不用在每個呼叫端(browse/*、professors/[id]、
 *  subfields/[id])各自再加一次 requireUser()。全站層級的粗篩仍在 middleware.ts
 *  (未帶 session cookie 直接擋在頁面渲染之前);這裡是頁面層級的權威複查
 *  (defense-in-depth,覆蓋「cookie 存在但已失效」這種 middleware 篩不掉的情況)。
 *  未登入者原本「完全不受影響」的舊行為到此為止——這正是本次要做的變更本身。 */
export async function blockUnitFromDirectory() {
  const user = await requireUser();
  if (user?.role === "UNIT") {
    await logSecurityEvent("authz.denied", "low", user.id, "", {
      resource: "PROFESSOR_DIRECTORY", note: "單位帳號嘗試瀏覽教授資料(白皮書2.5.2)",
    });
    redirect("/unit/dashboard");
  }
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
