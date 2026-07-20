// 資料庫 schema(Drizzle ORM / SQLite)
// ─────────────────────────────────────────────────────────────
// 換資料庫指南(給後續接手的工程師):
// 1. Drizzle 原生支援 PostgreSQL:將本檔 import 來源自 "drizzle-orm/sqlite-core"
//    改為 "drizzle-orm/pg-core",對應型別(text→text, integer→integer/serial,
//    integer timestamp→timestamp)後即可沿用同一套查詢語法。
// 2. 業務程式碼一律透過 src/server/repositories 存取資料,不直接 import 本檔,
//    因此換資料庫或換 ORM 的改動範圍被限制在 src/server/db 與 repositories 內。
// ─────────────────────────────────────────────────────────────
import { sqliteTable, text, integer, primaryKey, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const now = (col: string) => integer(col, { mode: "timestamp" }).notNull().default(sql`(unixepoch())`);

// ── 身分層 ────────────────────────────────────────────────

export const users = sqliteTable("users", {
  id: id(), // 內部 ID:不具業務意義,永不對外顯示
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(), // 平台暱稱(對外顯示)
  role: text("role").notNull().default("STUDENT_BACHELOR"), // STUDENT_BACHELOR | STUDENT_GRAD | PROFESSOR | ADMIN
  subRoles: text("sub_roles").notNull().default("[]"), // JSON array;權限判斷取聯集
  status: text("status").notNull().default("ACTIVE"), // ACTIVE | PENDING | SUSPENDED | ALUM | ARCHIVED
  totpSecretEnc: text("totp_secret_enc"), // §2.5:管理員 2FA 種子(加密儲存,見 crypto.ts)
  totpEnabled: integer("totp_enabled", { mode: "boolean" }).notNull().default(false),
  // ── 帳號生命週期自動化(架構書 §帳號生命週期)──
  // 偵測到「可能已離校」(email 失效訊號)後,不立即降級,而是進入 6 個月緩衝期,
  // bufferEndsAt 到期後才自動轉為 ALUM(唯讀)。正式環境的偵測來源應是教務處 API
  // 或信箱退信偵測,目前以管理員手動觸發模擬(見 lifecycle.ts 檔頭說明)。
  lifecycleBufferEndsAt: integer("lifecycle_buffer_ends_at", { mode: "timestamp" }),
  lifecycleNote: text("lifecycle_note").notNull().default(""),
  createdAt: now("created_at"),
});

export const emailVerifications = sqliteTable("email_verifications", {
  id: id(),
  email: text("email").notNull(),
  code: text("code").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  consumedAt: integer("consumed_at", { mode: "timestamp" }),
  createdAt: now("created_at"),
}, (t) => ({ emailCodeIdx: index("ev_email_code").on(t.email, t.code) }));

export const sessions = sqliteTable("sessions", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(), // 只存雜湊,不存明文 token
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(), // §2.4:絕對逾時
  lastUsedAt: now("last_used_at"), // §2.4:閒置逾時判斷依據
  stepUpAt: integer("step_up_at", { mode: "timestamp" }), // §2.5:最近一次敏感操作重驗時間
  createdAt: now("created_at"),
}, (t) => ({ userIdx: index("s_user").on(t.userId) }));

// ── 學術分類層(學院 → 系所 → 領域 → 子領域)──────────────

export const colleges = sqliteTable("colleges", {
  id: id(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const departments = sqliteTable("departments", {
  id: id(),
  collegeId: text("college_id").notNull().references(() => colleges.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => ({
  collegeSlugUq: uniqueIndex("d_college_slug").on(t.collegeId, t.slug),
  collegeIdx: index("d_college").on(t.collegeId),
}));

export const fields = sqliteTable("fields", {
  id: id(),
  departmentId: text("department_id").notNull().references(() => departments.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => ({ deptIdx: index("f_dept").on(t.departmentId) }));

export const subfields = sqliteTable("subfields", {
  id: id(),
  fieldId: text("field_id").notNull().references(() => fields.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => ({ fieldIdx: index("sf_field").on(t.fieldId) }));

// ── 教授檔案 ──────────────────────────────────────────────

export const professorProfiles = sqliteTable("professor_profiles", {
  id: id(),
  userId: text("user_id").unique().references(() => users.id), // 可空:目錄先建檔,教授之後認領
  displayName: text("display_name").notNull(),
  title: text("title").notNull().default("教授"),
  departmentId: text("department_id").notNull().references(() => departments.id),
  bio: text("bio").notNull().default(""),
  researchPage: text("research_page").notNull().default(""),
  isOpen: integer("is_open", { mode: "boolean" }).notNull().default(true), // 媒合一鍵開關
  verifyStatus: text("verify_status").notNull().default("SEED"), // SEED | PENDING | APPROVED | REJECTED
}, (t) => ({ deptIdx: index("p_dept").on(t.departmentId) }));

export const professorSpecialties = sqliteTable("professor_specialties", {
  professorId: text("professor_id").notNull().references(() => professorProfiles.id, { onDelete: "cascade" }),
  subfieldId: text("subfield_id").notNull().references(() => subfields.id, { onDelete: "cascade" }),
}, (t) => ({
  pk: primaryKey({ columns: [t.professorId, t.subfieldId] }),
  subIdx: index("ps_sub").on(t.subfieldId),
}));

// ── 需求與申請(五類:TA/DEPT/UR/REC/IND)───────────────────

export const postings = sqliteTable("postings", {
  id: id(),
  professorId: text("professor_id").notNull().references(() => professorProfiles.id, { onDelete: "cascade" }),
  category: text("category").notNull(), // TA | DEPT | UR | REC | IND
  title: text("title").notNull(),
  description: text("description").notNull(),
  isOpen: integer("is_open", { mode: "boolean" }).notNull().default(true),
  closedReason: text("closed_reason").notNull().default(""), // 空字串=手動關閉;professor_relinquished 等=系統自動關閉
  createdAt: now("created_at"),
}, (t) => ({
  openCatIdx: index("po_open_cat").on(t.isOpen, t.category),
  profIdx: index("po_prof").on(t.professorId),
}));

export const applications = sqliteTable("applications", {
  id: id(),
  postingId: text("posting_id").notNull().references(() => postings.id, { onDelete: "cascade" }),
  applicantId: text("applicant_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // pending → interview_invited → interviewed → accepted | rejected
  motivation: text("motivation").notNull(),
  motivationSummary: text("motivation_summary").notNull().default(""), // AI 摘要,需教授主動觸發產生,不自動跑
  payload: text("payload").notNull().default("{}"), // 類別專屬欄位(JSON)
  createdAt: now("created_at"),
  statusUpdatedAt: integer("status_updated_at", { mode: "timestamp" }), // 學期報告「平均審核時間」統計用
}, (t) => ({
  uq: uniqueIndex("a_posting_applicant").on(t.postingId, t.applicantId), // 不可重複申請
  applicantIdx: index("a_applicant").on(t.applicantId, t.createdAt),
}));

// ── 存證層(L3)────────────────────────────────────────────

export const agreementLogs = sqliteTable("agreement_logs", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  docType: text("doc_type").notNull(), // TERMS | NDA
  version: text("version").notNull(),
  ip: text("ip").notNull(),
  userAgent: text("user_agent").notNull().default(""),
  prevHash: text("prev_hash").notNull().default(""), // §5.2:雜湊鏈,竄改即斷鏈可偵測
  hash: text("hash").notNull().default(""),
  signedAt: now("signed_at"),
}, (t) => ({ userDocIdx: index("ag_user_doc").on(t.userId, t.docType) }));

export const reports = sqliteTable("reports", {
  id: id(),
  reporterId: text("reporter_id").notNull().references(() => users.id),
  targetType: text("target_type").notNull(), // POSTING | PROFESSOR | USER
  targetId: text("target_id").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("open"), // open | resolved | dismissed
  outcome: text("outcome").notNull().default(""), // 供檢舉成立比例統計
  createdAt: now("created_at"),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }), // 學期報告「平均處理時效」統計用
}, (t) => ({ statusIdx: index("r_status").on(t.status, t.createdAt) }));

// ── 通知(供「檢舉/申請結果中性通知」「進度可視化」使用)──────

export const notifications = sqliteTable("notifications", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // application.status | report.resolved | report.filed_against_you | professor.verified
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  link: text("link").notNull().default(""),
  isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
  createdAt: now("created_at"),
}, (t) => ({ userIdx: index("n_user").on(t.userId, t.isRead) }));

export const auditLogs = sqliteTable("audit_logs", {
  id: id(),
  actorId: text("actor_id").references(() => users.id),
  action: text("action").notNull(),
  targetType: text("target_type").notNull().default(""),
  targetId: text("target_id").notNull().default(""),
  meta: text("meta").notNull().default("{}"),
  prevHash: text("prev_hash").notNull().default(""), // §5.2:雜湊鏈
  hash: text("hash").notNull().default(""),
  createdAt: now("created_at"),
}, (t) => ({ timeIdx: index("al_time").on(t.createdAt) }));

// ── §2.3 登入速率限制與階梯式鎖定 ──────────────────────────
// 正式環境可換 Redis(高頻寫入/自動過期更合適),介面收斂在 repositories/ratelimit.ts,
// 頁面與 Server Action 一律不直接碰這張表。

export const loginAttempts = sqliteTable("login_attempts", {
  id: id(),
  email: text("email").notNull(),
  ip: text("ip").notNull(),
  ok: integer("ok", { mode: "boolean" }).notNull(),
  createdAt: now("created_at"),
}, (t) => ({
  emailTimeIdx: index("la_email_time").on(t.email, t.createdAt),
  ipTimeIdx: index("la_ip_time").on(t.ip, t.createdAt),
}));

// ── §3.3 應用層列舉偵測 ──────────────────────────────────
// 記錄「誰在什麼時間存取了哪個資源」,用於偵測「短時間內存取大量不同教授檔案」
// 這類爬取特徵的行為模式,而非依賴容易被繞過的 IP 層防禦。

export const accessEvents = sqliteTable("access_events", {
  id: id(),
  actorKey: text("actor_key").notNull(), // 已登入:userId;未登入:session-less 匿名 key(見 anti-scrape.ts)
  resourceType: text("resource_type").notNull(), // PROFESSOR | POSTING | SUBFIELD
  resourceId: text("resource_id").notNull(),
  createdAt: now("created_at"),
}, (t) => ({ actorTimeIdx: index("ae_actor_time").on(t.actorKey, t.createdAt) }));

// ── §8 安全事件與告警(區別於一般業務稽核 auditLogs)──────────

export const securityEvents = sqliteTable("security_events", {
  id: id(),
  type: text("type").notNull(), // login.rate_limited | login.locked | enum.detected | honeypot.triggered | authz.denied | integrity.broken | admin.step_up
  severity: text("severity").notNull().default("medium"), // low | medium | high
  actorId: text("actor_id").references(() => users.id),
  ip: text("ip").notNull().default(""),
  detail: text("detail").notNull().default("{}"), // 只放結構化中繼資料,絕不放明文機敏內容(密碼/驗證碼/訊息內文)
  createdAt: now("created_at"),
}, (t) => ({ typeTimeIdx: index("se_type_time").on(t.type, t.createdAt) }));

// ── §3.4 條件式人機驗證通過紀錄 ────────────────────────────
// 只在 §3.3 判定 risk=hard 時才要求驗證,通過後在時效內免重複驗證。
// verifyToken 只存雜湊,不存明文(與 session token 同慣例)。

export const humanChecks = sqliteTable("human_checks", {
  id: id(),
  actorKey: text("actor_key").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: now("created_at"),
}, (t) => ({ actorIdx: index("hc_actor").on(t.actorKey) }));

// ── 站內訊息(M4)+ 忙碌/有空狀態 + 分層揭露的站外聯絡方式(§3.2、§5.1)──

export const conversations = sqliteTable("conversations", {
  id: id(),
  contextType: text("context_type").notNull(), // APPLICATION(依附申請)| DIRECT(教授間直接邀約)
  contextId: text("context_id").notNull().default(""), // APPLICATION 時為 applications.id
  // 媒合前每日新對話數有上限(架構書 M4);媒合確認後解除限制,且訊息才可能被要求
  // 揭露聯絡方式。confirmedAt 為 null 代表尚未確認。
  confirmedAt: integer("confirmed_at", { mode: "timestamp" }),
  createdAt: now("created_at"),
}, (t) => ({ contextIdx: index("conv_context").on(t.contextType, t.contextId) }));

export const conversationMembers = sqliteTable("conversation_members", {
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // 忙碌/有空狀態:雙方各自手動設定,不做系統自動偵測的即時上下線(UX 決策已定案排除)
  status: text("status").notNull().default("available"), // available | away
  statusNote: text("status_note").notNull().default(""),
  lastReadAt: integer("last_read_at", { mode: "timestamp" }),
}, (t) => ({
  pk: primaryKey({ columns: [t.conversationId, t.userId] }),
  userIdx: index("cm_user").on(t.userId),
}));

export const messages = sqliteTable("messages", {
  id: id(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderId: text("sender_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: now("created_at"),
}, (t) => ({ convTimeIdx: index("msg_conv_time").on(t.conversationId, t.createdAt) }));

// 使用者自己維護的聯絡方式,值一律加密存放(§5.1,見 src/server/crypto.ts)
export const userContacts = sqliteTable("user_contacts", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // LINE | WEBSITE | OTHER
  valueEnc: text("value_enc").notNull(),
  createdAt: now("created_at"),
}, (t) => ({ userIdx: index("uc_user").on(t.userId) }));

// 揭露事件本身即存證(架構書 §3.2「揭露留痕」):誰在哪個對話裡、對誰、揭露了什麼、何時。
// valueEnc 為揭露當下的值之複本(加密),獨立於 userContacts,避免使用者事後改動原始
// 聯絡方式導致歷史揭露紀錄跟著變動——存證要反映「揭露當下真正給出去的內容」。
export const contactDisclosures = sqliteTable("contact_disclosures", {
  id: id(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  discloserId: text("discloser_id").notNull().references(() => users.id),
  kind: text("kind").notNull(),
  valueEnc: text("value_enc").notNull(),
  disclosedAt: now("disclosed_at"),
}, (t) => ({ convIdx: index("cd_conv").on(t.conversationId) }));

// ── 帳號血緣(架構書:學士→碩士開新帳號的通則,碩士→博士可專案延用)──────
// 舊帳號內容完全不動,只多一條指向新帳號的關聯;isVisible 控制是否公開可查詢。

export const accountLineage = sqliteTable("account_lineage", {
  id: id(),
  fromAccountId: text("from_account_id").notNull().references(() => users.id),
  toAccountId: text("to_account_id").notNull().references(() => users.id),
  linkType: text("link_type").notNull(), // bachelor_to_master | master_to_phd_new | master_to_phd_continued
  isVisible: integer("is_visible", { mode: "boolean" }).notNull().default(true),
  createdAt: now("created_at"),
}, (t) => ({ fromIdx: index("al_from").on(t.fromAccountId), toIdx: index("al_to").on(t.toAccountId) }));

// ── 教授帳號交接(架構書:放棄帳號需 30–90 天前申請,通知利益相關人)────────

export const professorRelinquishments = sqliteTable("professor_relinquishments", {
  id: id(),
  professorId: text("professor_id").notNull().references(() => professorProfiles.id),
  initiatedById: text("initiated_by_id").notNull().references(() => users.id),
  reason: text("reason").notNull().default(""),
  relinquishAt: integer("relinquish_at", { mode: "timestamp" }).notNull(), // 至少 30 天後
  status: text("status").notNull().default("pending"), // pending | completed | cancelled
  createdAt: now("created_at"),
}, (t) => ({ statusIdx: index("pr_status").on(t.status, t.relinquishAt) }));

// ── M7 面試時段預約 + ics 行事曆同步 ──────────────────────
// 地點資訊為「媒合後才揭露」等級,僅對已預約該時段的申請人顯示(見 repository 層)。

export const interviewSlots = sqliteTable("interview_slots", {
  id: id(),
  postingId: text("posting_id").notNull().references(() => postings.id, { onDelete: "cascade" }),
  professorId: text("professor_id").notNull().references(() => professorProfiles.id),
  startAt: integer("start_at", { mode: "timestamp" }).notNull(),
  endAt: integer("end_at", { mode: "timestamp" }).notNull(),
  location: text("location").notNull().default(""),
  isBooked: integer("is_booked", { mode: "boolean" }).notNull().default(false),
  applicationId: text("application_id").references(() => applications.id),
  createdAt: now("created_at"),
}, (t) => ({ postingIdx: index("is_posting").on(t.postingId, t.isBooked) }));

// ics 行事曆訂閱 token:90–180 天到期(架構規格 §7 已定案),只存雜湊。
export const icsTokens = sqliteTable("ics_tokens", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: now("created_at"),
}, (t) => ({ userIdx: index("ics_user").on(t.userId) }));

// ── M8 教授實驗室/計畫團隊群組(貼文一律不可公開)────────────

export const groups = sqliteTable("groups", {
  id: id(),
  ownerId: text("owner_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdAt: now("created_at"),
});

export const groupMembers = sqliteTable("group_members", {
  groupId: text("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"), // owner | member
  joinedAt: now("joined_at"),
}, (t) => ({ pk: primaryKey({ columns: [t.groupId, t.userId] }), userIdx: index("gm_user").on(t.userId) }));

export const groupPosts = sqliteTable("group_posts", {
  id: id(),
  groupId: text("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: now("created_at"),
}, (t) => ({ groupIdx: index("gp_group").on(t.groupId, t.createdAt) }));

// ── §6 檔案上傳安全 ────────────────────────────────────────
// 目前唯一使用情境:學生於申請時可附上履歷/研究草稿。storagePath 指向伺服器本機的
// 私有儲存目錄(非 public/,不可直接以固定網址存取),正式環境換成雲端物件儲存時,
// 只需改 src/server/storage.ts 的實作,本表結構不需變動。

export const attachments = sqliteTable("attachments", {
  id: id(),
  ownerId: text("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  applicationId: text("application_id").references(() => applications.id, { onDelete: "cascade" }),
  originalName: text("original_name").notNull().default(""), // 僅供顯示用,絕不用作儲存路徑(防路徑穿越)
  storedFilename: text("stored_filename").notNull().unique(), // 系統隨機產生,與原始檔名無關
  mimeType: text("mime_type").notNull(), // 依 magic number 偵測結果,不採信使用者端聲稱的 Content-Type
  sizeBytes: integer("size_bytes").notNull(),
  scanStatus: text("scan_status").notNull().default("pending"), // pending | clean | infected | error
  createdAt: now("created_at"),
}, (t) => ({ ownerIdx: index("att_owner").on(t.ownerId), appIdx: index("att_app").on(t.applicationId) }));

// 時效簽名下載連結(§5.2 呼應,不給永久公開網址)。tokenHash 只存雜湊,與 session 同慣例。
export const fileDownloadTokens = sqliteTable("file_download_tokens", {
  id: id(),
  attachmentId: text("attachment_id").notNull().references(() => attachments.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: now("created_at"),
}, (t) => ({ attIdx: index("fdt_att").on(t.attachmentId) }));

export const dualApprovals = sqliteTable("dual_approvals", {
  id: id(),
  requesterId: text("requester_id").notNull().references(() => users.id),
  action: text("action").notNull(), // 欲執行的動作代碼,如 conversation.view_messages
  targetType: text("target_type").notNull().default(""),
  targetId: text("target_id").notNull().default(""),
  status: text("status").notNull().default("pending"), // pending | approved | rejected | expired
  approverId: text("approver_id").references(() => users.id),
  approvedAt: integer("approved_at", { mode: "timestamp" }), // 核可當下時間,存取時效窗口以此起算
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(), // 「待核可」本身的過期時間(逾時未核可自動失效)
  createdAt: now("created_at"),
}, (t) => ({ statusIdx: index("da_status").on(t.status, t.createdAt) }));
