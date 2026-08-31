// 資料庫 schema(Drizzle ORM / PostgreSQL)
// ─────────────────────────────────────────────────────────────
// 2026-08 換資料庫紀錄:原為 SQLite(drizzle-orm/sqlite-core),本輪依白皮書 3.1
// 「正式環境 PostgreSQL」改為 drizzle-orm/pg-core,原因是免費 24/7 託管(Vercel)
// 的無伺服器環境沒有可長駐的本機檔案系統,SQLite 檔案無法安全存活。
// 換動對照:text→text(不變)、integer(mode:boolean)→boolean、
// integer(mode:timestamp)→timestamp(withTimezone:true)、其餘 integer 不變。
// 業務程式碼一律透過 src/server/repositories 存取資料,不直接 import 本檔,
// 因此這次換資料庫的改動範圍被限制在 src/server/db 與少數 repositories(見
// repositories/attachments.ts 內對 better-sqlite3 專屬交易寫法的重寫說明)。
// ─────────────────────────────────────────────────────────────
import { pgTable, text, integer, boolean, timestamp, primaryKey, uniqueIndex, index, customType } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// PostgreSQL 的二進位型別。drizzle-orm 的 pg-core 沒有內建 bytea,依官方建議以
// customType 定義;node-postgres 本來就會把 bytea 欄位讀成 Buffer、也接受 Buffer 作為
// 參數,所以這裡不需要任何額外的編解碼。
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() { return "bytea"; },
});

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const now = (col: string) => timestamp(col, { mode: "date", withTimezone: true }).notNull().default(sql`now()`);
const ts = (col: string) => timestamp(col, { mode: "date", withTimezone: true });

// ── 身分層 ────────────────────────────────────────────────

export const users = pgTable("users", {
  id: id(), // 內部 ID:不具業務意義,永不對外顯示
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(), // 平台暱稱(對外顯示,可申請修改,見 2.2.2)
  // 白皮書 2.2.2:真實姓名(demo 環境無 iNCCU 可回傳,建立帳號時以當下 displayName 為預設值,
  // 之後 displayName 若被使用者修改,realName 不跟著動——保留「內部可查證的原始姓名」語意,
  // 供稽核/檢舉查證使用,不對外顯示)。
  realName: text("real_name").notNull().default(""),
  role: text("role").notNull().default("STUDENT_BACHELOR"), // STUDENT_BACHELOR | STUDENT_GRAD | PROFESSOR | UNIT | ADMIN
  subRoles: text("sub_roles").notNull().default("[]"), // JSON array;權限判斷取聯集
  status: text("status").notNull().default("ACTIVE"), // ACTIVE | PENDING | SUSPENDED | ALUM | ARCHIVED
  // 白皮書 2.2.3 學制標記:自填、預設未驗證,唯一有實質差異之處是「可否自行發布需求找幫手」
  // (見 postingVersions 旁的 GRAD_HELPER 類別與 authz.ts 的 requireVerifiedGradStudent)。
  // 刻意不取代既有的 role=STUDENT_GRAD(避免大改既有判斷式),兩個訊號並存、任一為真即視為研究生,
  // 這裡新增的是白皮書要求的「自填+未驗證標示+特定功能才需驗證」路徑。
  degreeLevel: text("degree_level"), // null | BACHELOR | MASTER | PHD(使用者自填)
  degreeLevelVerifiedAt: ts("degree_level_verified_at"), // 由指導教授確認後寫入,見 2.2.3
  totpSecretEnc: text("totp_secret_enc"), // §2.5:管理員 2FA 種子(加密儲存,見 crypto.ts)
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  // ── 帳號生命週期自動化(架構書 §帳號生命週期)──
  // 偵測到「可能已離校」(email 失效訊號)後,不立即降級,而是進入 6 個月緩衝期,
  // bufferEndsAt 到期後才自動轉為 ALUM(唯讀)。正式環境的偵測來源應是教務處 API
  // 或信箱退信偵測,目前以管理員手動觸發模擬(見 lifecycle.ts 檔頭說明)。
  lifecycleBufferEndsAt: ts("lifecycle_buffer_ends_at"),
  lifecycleNote: text("lifecycle_note").notNull().default(""),
  createdAt: now("created_at"),
});

export const emailVerifications = pgTable("email_verifications", {
  id: id(),
  email: text("email").notNull(),
  code: text("code").notNull(),
  expiresAt: ts("expires_at").notNull(),
  consumedAt: ts("consumed_at"),
  createdAt: now("created_at"),
}, (t) => ({ emailCodeIdx: index("ev_email_code").on(t.email, t.code) }));

export const sessions = pgTable("sessions", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(), // 只存雜湊,不存明文 token
  expiresAt: ts("expires_at").notNull(), // §2.4:絕對逾時
  lastUsedAt: now("last_used_at"), // §2.4:閒置逾時判斷依據
  stepUpAt: ts("step_up_at"), // §2.5:最近一次敏感操作重驗時間
  // 白皮書 3.2.5「登入裝置清單與強制登出」:純粹顯示用資訊,不作為安全判斷依據
  // (偽造 User-Agent 很容易,這裡只是方便使用者自己辨認「這是不是我的裝置」)。
  userAgent: text("user_agent").notNull().default(""),
  createdIp: text("created_ip").notNull().default(""),
  // 白皮書 1.5/2.2.1「登入來源可抽換」:記錄此 session 是透過哪個身分提供者建立,
  // 見 src/server/auth/providers.ts。目前只有一種(mock-email-code),先寫入欄位是為了
  // 將來真的接上 iNCCU 時,可以不動 schema 就分辨新舊 session 的來源。
  provider: text("provider").notNull().default("mock-email-code"),
  createdAt: now("created_at"),
}, (t) => ({ userIdx: index("s_user").on(t.userId) }));

// ── 學術分類層(學院 → 系所 → 領域 → 子領域)──────────────

export const colleges = pgTable("colleges", {
  id: id(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const departments = pgTable("departments", {
  id: id(),
  collegeId: text("college_id").notNull().references(() => colleges.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => ({
  collegeSlugUq: uniqueIndex("d_college_slug").on(t.collegeId, t.slug),
  collegeIdx: index("d_college").on(t.collegeId),
}));

export const fields = pgTable("fields", {
  id: id(),
  departmentId: text("department_id").notNull().references(() => departments.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => ({ deptIdx: index("f_dept").on(t.departmentId) }));

export const subfields = pgTable("subfields", {
  id: id(),
  fieldId: text("field_id").notNull().references(() => fields.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => ({ fieldIdx: index("sf_field").on(t.fieldId) }));

// ── 教授檔案 ──────────────────────────────────────────────

export const professorProfiles = pgTable("professor_profiles", {
  id: id(),
  userId: text("user_id").unique().references(() => users.id), // 可空:目錄先建檔,教授之後認領
  displayName: text("display_name").notNull(),
  title: text("title").notNull().default("教授"),
  departmentId: text("department_id").notNull().references(() => departments.id),
  bio: text("bio").notNull().default(""),
  researchPage: text("research_page").notNull().default(""),
  isOpen: boolean("is_open").notNull().default(true), // 媒合一鍵開關
  verifyStatus: text("verify_status").notNull().default("SEED"), // SEED | PENDING | APPROVED | REJECTED
}, (t) => ({ deptIdx: index("p_dept").on(t.departmentId) }));

export const professorSpecialties = pgTable("professor_specialties", {
  professorId: text("professor_id").notNull().references(() => professorProfiles.id, { onDelete: "cascade" }),
  subfieldId: text("subfield_id").notNull().references(() => subfields.id, { onDelete: "cascade" }),
}, (t) => ({
  pk: primaryKey({ columns: [t.professorId, t.subfieldId] }),
  subIdx: index("ps_sub").on(t.subfieldId),
}));

// ── 需求與申請(白皮書 2.1「事由 × 發起方」二維模型─廣播式需求)──────────
// 2026-08 重構:移除 IND(產學跨域,已依白皮書 1.3 排除範圍定案不做)。
// UR(大專生計畫)、REC(推薦信)兩類改為「學生發起」,不再由教授/單位以 posting 廣播,
// 詳見下方 studentRequests。本表現在僅保留「教授/單位 → 學生」方向的四類 + 新增 RA。
// TA(課程助教,教授)| RA(研究助理,教授)| LAB(實驗室成員招募,教授)|
// DEPT(系辦短期校內工讀,現況仍由教授帳號代發,真正的「單位帳號」角色見白皮書 2.5,尚未實作) |
// EXT(校外計畫指導教授,教授於有名額時公布)

// 白皮書 2.5「單位帳號」(系辦、職涯中心等)。刻意比照 professorProfiles 掛在單一 users 帳號下
// (2.5.1「允許多處同時登入」講的是同一組帳密多人共用,不是每個承辦人各自開帳號),
// 差別在於單位沒有目錄瀏覽身分,只用來發布 postings(見下方 posterType)。
export const unitProfiles = pgTable("unit_profiles", {
  id: id(),
  userId: text("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // 如「外文系系辦」「職涯發展中心」
  contactEmail: text("contact_email").notNull(),
  extension: text("extension").notNull().default(""),
  createdAt: now("created_at"),
});

export const postings = pgTable("postings", {
  id: id(),
  // 白皮書 2.1「事由 × 發起方」:發起方不再只能是教授。posterType 決定下面三個發起人欄位
  // 哪一個有值,其餘為 null——三選一而非各開一張子表,是因為 applications/interviewSlots/
  // attachments 等下游表都只認 postingId,不想讓下游程式碼還要分岔處理「這是誰發的」。
  posterType: text("poster_type").notNull().default("PROFESSOR"), // PROFESSOR | UNIT | STUDENT
  professorId: text("professor_id").references(() => professorProfiles.id, { onDelete: "cascade" }),
  unitId: text("unit_id").references(() => unitProfiles.id, { onDelete: "cascade" }),
  studentPosterId: text("student_poster_id").references(() => users.id, { onDelete: "cascade" }),
  // TA/RA/LAB/EXT(posterType=PROFESSOR)| DEPT/WORK_STUDY(posterType=UNIT)|
  // GRAD_HELPER(posterType=STUDENT,白皮書2.4)| CLUB_RECRUIT/TEAM_UP/PROJECT_COLLAB/
  // EVENT_ORG/STARTUP_IDEA/OTHER_COLLAB(posterType=STUDENT,白皮書2.6 學生合作專區六分區)
  category: text("category").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  // 白皮書 2.5.3/2.6.2:工讀職缺與學生合作專區都有各自的結構化欄位,不want五花八門另開很多張
  // 只用得到一次的表,沿用 studentRequests.payload 已經在用的「類別專屬 JSON 欄位」慣例。
  structuredFields: text("structured_fields").notNull().default("{}"),
  isOpen: boolean("is_open").notNull().default(true),
  closedReason: text("closed_reason").notNull().default(""), // 空字串=手動關閉;professor_relinquished 等=系統自動關閉
  // 白皮書 2.8.1 編輯歷史:每次編輯遞增,搭配 postingVersions 表記錄「編輯前」快照。
  currentVersion: integer("current_version").notNull().default(1),
  createdAt: now("created_at"),
}, (t) => ({
  openCatIdx: index("po_open_cat").on(t.isOpen, t.category),
  profIdx: index("po_prof").on(t.professorId),
  unitIdx: index("po_unit").on(t.unitId),
  studentIdx: index("po_student").on(t.studentPosterId),
}));

// 白皮書 2.8.1/2.8.2:貼文編輯歷史。存的是「編輯前」的內容(即這個版本號實際生效的期間是
// 從上一版編輯時間到這次編輯時間),配合 postings.currentVersion 可還原任一時間點的完整內容。
export const postingVersions = pgTable("posting_versions", {
  id: id(),
  postingId: text("posting_id").notNull().references(() => postings.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  structuredFields: text("structured_fields").notNull().default("{}"),
  editedByUserId: text("edited_by_user_id").notNull().references(() => users.id),
  editedAt: now("edited_at"),
}, (t) => ({ postingIdx: index("pv_posting").on(t.postingId, t.versionNumber) }));

export const applications = pgTable("applications", {
  id: id(),
  postingId: text("posting_id").notNull().references(() => postings.id, { onDelete: "cascade" }),
  applicantId: text("applicant_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // pending → interview_invited → interviewed → accepted | rejected
  motivation: text("motivation").notNull(),
  motivationSummary: text("motivation_summary").notNull().default(""), // AI 摘要,需教授主動觸發產生,不自動跑
  payload: text("payload").notNull().default("{}"), // 類別專屬欄位(JSON)
  // 白皮書 2.8.1 附帶要求(前段註記):貼文可能在有人申請後被編輯,若發生糾紛需要能對照
  // 「申請當下貼文長什麼樣子」,因此記錄申請當下的 postings.currentVersion。
  appliedAtVersion: integer("applied_at_version").notNull().default(1),
  createdAt: now("created_at"),
  statusUpdatedAt: ts("status_updated_at"), // 學期報告「平均審核時間」統計用
}, (t) => ({
  uq: uniqueIndex("a_posting_applicant").on(t.postingId, t.applicantId), // 不可重複申請
  applicantIdx: index("a_applicant").on(t.applicantId, t.createdAt),
}));

// ── 存證層(L3)────────────────────────────────────────────

export const agreementLogs = pgTable("agreement_logs", {
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

export const reports = pgTable("reports", {
  id: id(),
  reporterId: text("reporter_id").notNull().references(() => users.id),
  targetType: text("target_type").notNull(), // POSTING | PROFESSOR | USER
  targetId: text("target_id").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("open"), // open | resolved | dismissed
  outcome: text("outcome").notNull().default(""), // 供檢舉成立比例統計
  createdAt: now("created_at"),
  resolvedAt: ts("resolved_at"), // 學期報告「平均處理時效」統計用
}, (t) => ({ statusIdx: index("r_status").on(t.status, t.createdAt) }));

// ── 通知(供「檢舉/申請結果中性通知」「進度可視化」使用)──────

export const notifications = pgTable("notifications", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // application.status | report.resolved | report.filed_against_you | professor.verified
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  link: text("link").notNull().default(""),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: now("created_at"),
}, (t) => ({ userIdx: index("n_user").on(t.userId, t.isRead) }));

export const auditLogs = pgTable("audit_logs", {
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

export const loginAttempts = pgTable("login_attempts", {
  id: id(),
  email: text("email").notNull(),
  ip: text("ip").notNull(),
  ok: boolean("ok").notNull(),
  createdAt: now("created_at"),
}, (t) => ({
  emailTimeIdx: index("la_email_time").on(t.email, t.createdAt),
  ipTimeIdx: index("la_ip_time").on(t.ip, t.createdAt),
}));

// ── §3.3 應用層列舉偵測 ──────────────────────────────────
// 記錄「誰在什麼時間存取了哪個資源」,用於偵測「短時間內存取大量不同教授檔案」
// 這類爬取特徵的行為模式,而非依賴容易被繞過的 IP 層防禦。

export const accessEvents = pgTable("access_events", {
  id: id(),
  actorKey: text("actor_key").notNull(), // 已登入:userId;未登入:session-less 匿名 key(見 anti-scrape.ts)
  resourceType: text("resource_type").notNull(), // PROFESSOR | POSTING | SUBFIELD
  resourceId: text("resource_id").notNull(),
  createdAt: now("created_at"),
}, (t) => ({ actorTimeIdx: index("ae_actor_time").on(t.actorKey, t.createdAt) }));

// ── §8 安全事件與告警(區別於一般業務稽核 auditLogs)──────────

export const securityEvents = pgTable("security_events", {
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

export const humanChecks = pgTable("human_checks", {
  id: id(),
  actorKey: text("actor_key").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: now("created_at"),
}, (t) => ({ actorIdx: index("hc_actor").on(t.actorKey) }));

// ── 站內訊息(M4)+ 忙碌/有空狀態 + 分層揭露的站外聯絡方式(§3.2、§5.1)──

export const conversations = pgTable("conversations", {
  id: id(),
  contextType: text("context_type").notNull(), // APPLICATION(依附申請)| DIRECT(教授間直接邀約)
  contextId: text("context_id").notNull().default(""), // APPLICATION 時為 applications.id
  // 媒合前每日新對話數有上限(架構書 M4);媒合確認後解除限制,且訊息才可能被要求
  // 揭露聯絡方式。confirmedAt 為 null 代表尚未確認。
  confirmedAt: ts("confirmed_at"),
  createdAt: now("created_at"),
}, (t) => ({ contextIdx: index("conv_context").on(t.contextType, t.contextId) }));

export const conversationMembers = pgTable("conversation_members", {
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // 忙碌/有空狀態:雙方各自手動設定,不做系統自動偵測的即時上下線(UX 決策已定案排除)
  status: text("status").notNull().default("available"), // available | away
  statusNote: text("status_note").notNull().default(""),
  lastReadAt: ts("last_read_at"),
}, (t) => ({
  pk: primaryKey({ columns: [t.conversationId, t.userId] }),
  userIdx: index("cm_user").on(t.userId),
}));

export const messages = pgTable("messages", {
  id: id(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderId: text("sender_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: now("created_at"),
}, (t) => ({ convTimeIdx: index("msg_conv_time").on(t.conversationId, t.createdAt) }));

// 使用者自己維護的聯絡方式,值一律加密存放(§5.1,見 src/server/crypto.ts)
export const userContacts = pgTable("user_contacts", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // LINE | WEBSITE | OTHER
  valueEnc: text("value_enc").notNull(),
  createdAt: now("created_at"),
}, (t) => ({ userIdx: index("uc_user").on(t.userId) }));

// 揭露事件本身即存證(架構書 §3.2「揭露留痕」):誰在哪個對話裡、對誰、揭露了什麼、何時。
// valueEnc 為揭露當下的值之複本(加密),獨立於 userContacts,避免使用者事後改動原始
// 聯絡方式導致歷史揭露紀錄跟著變動——存證要反映「揭露當下真正給出去的內容」。
export const contactDisclosures = pgTable("contact_disclosures", {
  id: id(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  discloserId: text("discloser_id").notNull().references(() => users.id),
  kind: text("kind").notNull(),
  valueEnc: text("value_enc").notNull(),
  disclosedAt: now("disclosed_at"),
}, (t) => ({ convIdx: index("cd_conv").on(t.conversationId) }));

// ── 帳號血緣(架構書:學士→碩士開新帳號的通則,碩士→博士可專案延用)──────
// 舊帳號內容完全不動,只多一條指向新帳號的關聯;isVisible 控制是否公開可查詢。

export const accountLineage = pgTable("account_lineage", {
  id: id(),
  fromAccountId: text("from_account_id").notNull().references(() => users.id),
  toAccountId: text("to_account_id").notNull().references(() => users.id),
  linkType: text("link_type").notNull(), // bachelor_to_master | master_to_phd_new | master_to_phd_continued
  isVisible: boolean("is_visible").notNull().default(true),
  createdAt: now("created_at"),
}, (t) => ({ fromIdx: index("al_from").on(t.fromAccountId), toIdx: index("al_to").on(t.toAccountId) }));

// ── 教授帳號交接(架構書:放棄帳號需 30–90 天前申請,通知利益相關人)────────

export const professorRelinquishments = pgTable("professor_relinquishments", {
  id: id(),
  professorId: text("professor_id").notNull().references(() => professorProfiles.id),
  initiatedById: text("initiated_by_id").notNull().references(() => users.id),
  reason: text("reason").notNull().default(""),
  relinquishAt: ts("relinquish_at").notNull(), // 至少 30 天後
  status: text("status").notNull().default("pending"), // pending | completed | cancelled
  createdAt: now("created_at"),
}, (t) => ({ statusIdx: index("pr_status").on(t.status, t.relinquishAt) }));

// ── M7 面試時段預約 + ics 行事曆同步 ──────────────────────
// 地點資訊為「媒合後才揭露」等級,僅對已預約該時段的申請人顯示(見 repository 層)。

export const interviewSlots = pgTable("interview_slots", {
  id: id(),
  postingId: text("posting_id").notNull().references(() => postings.id, { onDelete: "cascade" }),
  professorId: text("professor_id").notNull().references(() => professorProfiles.id),
  startAt: ts("start_at").notNull(),
  endAt: ts("end_at").notNull(),
  location: text("location").notNull().default(""),
  isBooked: boolean("is_booked").notNull().default(false),
  applicationId: text("application_id").references(() => applications.id),
  createdAt: now("created_at"),
}, (t) => ({ postingIdx: index("is_posting").on(t.postingId, t.isBooked) }));

// ics 行事曆訂閱 token:90–180 天到期(架構規格 §7 已定案),只存雜湊。
export const icsTokens = pgTable("ics_tokens", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: now("created_at"),
}, (t) => ({ userIdx: index("ics_user").on(t.userId) }));

// ── M8 教授實驗室/計畫團隊群組(貼文一律不可公開)────────────

export const groups = pgTable("groups", {
  id: id(),
  ownerId: text("owner_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdAt: now("created_at"),
});

export const groupMembers = pgTable("group_members", {
  groupId: text("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"), // owner | member
  joinedAt: now("joined_at"),
}, (t) => ({ pk: primaryKey({ columns: [t.groupId, t.userId] }), userIdx: index("gm_user").on(t.userId) }));

export const groupPosts = pgTable("group_posts", {
  id: id(),
  groupId: text("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: now("created_at"),
}, (t) => ({ groupIdx: index("gp_group").on(t.groupId, t.createdAt) }));

// ── §6 檔案上傳安全 ────────────────────────────────────────
// 目前實作:storedFilename 存放 Vercel Blob 回傳的私有 blob 網址(見 src/server/storage.ts),
// 非本機路徑。欄位名稱沿用舊名(storedFilename)以縮小改動範圍,語意改為「儲存端識別碼」。

export const attachments = pgTable("attachments", {
  id: id(),
  ownerId: text("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  applicationId: text("application_id").references(() => applications.id, { onDelete: "cascade" }),
  // 白皮書 2.7.2 群組共用檔案區:刻意沿用同一張 attachments 表(同一套 magic-number 型別檢查、
  // 同一套下載 token 機制),而不是另開一張 groupFiles 表——applicationId/groupId 兩者恰好
  // 互斥(申請附件屬於某個申請;群組檔案屬於某個群組),下游的下載/刪除邏輯只需多判斷一個欄位。
  groupId: text("group_id").references(() => groups.id, { onDelete: "cascade" }),
  originalName: text("original_name").notNull().default(""), // 僅供顯示用,絕不用作儲存路徑(防路徑穿越)
  storedFilename: text("stored_filename").notNull().unique(), // 系統隨機產生,與原始檔名無關
  mimeType: text("mime_type").notNull(), // 依 magic number 偵測結果,不採信使用者端聲稱的 Content-Type
  sizeBytes: integer("size_bytes").notNull(),
  scanStatus: text("scan_status").notNull().default("pending"), // pending | clean | infected | error
  createdAt: now("created_at"),
  // 白皮書 2.7.2:群組共用檔案「單檔僅保留一個月,到期前一週提醒」。僅群組檔案
  // (groupId 非 null)會設定這兩欄;申請附件(applicationId)不設到期,維持原行為。
  expiresAt: ts("expires_at"),
  expiryRemindedAt: ts("expiry_reminded_at"), // 已提醒過,避免重複提醒
}, (t) => ({
  ownerIdx: index("att_owner").on(t.ownerId),
  appIdx: index("att_app").on(t.applicationId),
  groupIdx: index("att_group").on(t.groupId),
}));

// 白皮書 2.12.2 使用者隱藏(靜音,非阻斷):單向、不對稱、被隱藏方不知情。
export const userHides = pgTable("user_hides", {
  id: id(),
  hiderUserId: text("hider_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  hiddenUserId: text("hidden_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: now("created_at"),
}, (t) => ({
  uq: uniqueIndex("uh_pair").on(t.hiderUserId, t.hiddenUserId),
  hiderIdx: index("uh_hider").on(t.hiderUserId),
  hiddenIdx: index("uh_hidden").on(t.hiddenUserId),
}));

// 白皮書 2.13 資料匯出:比照 icsTokens 的一次性連結慣例(只存雜湊、有效期、可查詢是否已領取)。
// 未實作原文提到的「匯出時另設密碼保護壓縮檔」——原文自己在該密碼是否可更改留了問號、
// 屬未定案細節,本輪簡化為「連結本身即為時效存取憑證」,已在交付文件中誠實註明此簡化。
export const dataExportTokens = pgTable("data_export_tokens", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  downloadedAt: ts("downloaded_at"),
  createdAt: now("created_at"),
}, (t) => ({ userIdx: index("det_user").on(t.userId) }));

// 時效簽名下載連結(§5.2 呼應,不給永久公開網址)。tokenHash 只存雜湊,與 session 同慣例。
export const fileDownloadTokens = pgTable("file_download_tokens", {
  id: id(),
  attachmentId: text("attachment_id").notNull().references(() => attachments.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: now("created_at"),
}, (t) => ({ attIdx: index("fdt_att").on(t.attachmentId) }));

export const dualApprovals = pgTable("dual_approvals", {
  id: id(),
  requesterId: text("requester_id").notNull().references(() => users.id),
  action: text("action").notNull(), // 欲執行的動作代碼,如 conversation.view_messages
  targetType: text("target_type").notNull().default(""),
  targetId: text("target_id").notNull().default(""),
  status: text("status").notNull().default("pending"), // pending | approved | rejected | expired
  approverId: text("approver_id").references(() => users.id),
  approvedAt: ts("approved_at"), // 核可當下時間,存取時效窗口以此起算
  expiresAt: ts("expires_at").notNull(), // 「待核可」本身的過期時間(逾時未核可自動失效)
  createdAt: now("created_at"),
}, (t) => ({ statusIdx: index("da_status").on(t.status, t.createdAt) }));

// ── 白皮書 §2.3.1「可受理的學生請求」五項設定區(2026-08 新增)───────────
// 技術原則(白皮書明文要求):五項開關由同一支函式帶不同參數實作,不分別寫五套邏輯——
// 落地方式即為本表:每位教授最多五列(每種 type 一列),而非五張獨立表。
// REC(撰寫推薦信)| UR(指導大專生研究計畫)| LAB_JOIN(加入實驗室/指導畢業專題)|
// EXT_ENDORSE(擔任校外計畫指導教授)| COLLAB_GUIDE(指導學生合作專案——本項僅存開關,
// 實際請求流程要等白皮書 2.6 學生合作專區模組上線才會有出口,屬誠實的範圍界定,非遺漏)
export const professorIntakeSettings = pgTable("professor_intake_settings", {
  id: id(),
  professorId: text("professor_id").notNull().references(() => professorProfiles.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // REC | UR | LAB_JOIN | EXT_ENDORSE | COLLAB_GUIDE
  enabled: boolean("enabled").notNull().default(false),
  conditionText: text("condition_text").notNull().default(""), // 教授自訂條件文字,如「修過我的課且成績 B+ 以上」
  quotaNote: text("quota_note").notNull().default(""), // 教授自行填寫的名額描述,如「每學期 2 封(已撰寫 1 封)」;白皮書明定為教授自填,非系統計數
  updatedAt: now("updated_at"),
}, (t) => ({
  profTypeUq: uniqueIndex("pis_prof_type").on(t.professorId, t.type),
}));

// ── 白皮書 §2.9 推薦信 / §2.10 大專生計畫 等「學生 → 教授」請求(2026-08 新增)──────
// 對應白皮書 2.1 二維模型中「學生發起」的四類事由。與 postings/applications(教授或
// 單位廣播、學生應徵)方向相反:此處是學生主動對「特定教授」提出請求,教授逐一回應。
// 狀態機刻意做成單一共用機制,REC 多出 writing/sent 兩個結尾前狀態,其餘三類直接停在
// accepted/declined(白皮書僅 REC 明確定義「撰寫中」的中介狀態,UR/LAB_JOIN/EXT_ENDORSE
// 的後續指導關係走平台外既有程序,不在本平台追蹤撰寫進度)。
//   pending → wants_to_talk ┐
//   pending ─────────────────┼→ accepted ─(僅 REC)→ writing → sent
//                             │                              └→ declined_after_accept
//                             └→ declined
export const studentRequests = pgTable("student_requests", {
  id: id(),
  type: text("type").notNull(), // REC | UR | LAB_JOIN | EXT_ENDORSE
  studentId: text("student_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  professorId: text("professor_id").notNull().references(() => professorProfiles.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  payload: text("payload").notNull().default("{}"), // 類別專屬欄位(JSON),如 REC 的目的/截止日/主旨
  createdAt: now("created_at"),
  statusUpdatedAt: ts("status_updated_at"),
}, (t) => ({
  profStatusIdx: index("sr_prof_status").on(t.professorId, t.status),
  studentIdx: index("sr_student").on(t.studentId, t.createdAt),
}));

// ── 檔案內容儲存(2026-08-31 新增)────────────────────────────────
// 為什麼會有這張表:免費的無伺服器託管(Vercel)沒有可寫入、可跨請求存活的磁碟,
// 因此 private-uploads/ 那條路在雲端完全行不通。原本的替代方案是 Vercel Blob,
// 但那需要使用者另外到主控台建立一個 Blob store 並重新部署——對「只是想把網址丟給
// 別人試用」的情境來說,是一道沒有必要的額外關卡,而且忘記最後那步 Redeploy 就會
// 得到一個看起來像壞掉的上傳功能。
//
// 這裡改用一個已經存在、不需要再申請任何東西的儲存空間:同一個 PostgreSQL 資料庫。
// 群組共用檔案單檔上限 5MB、申請附件 10MB,而 Neon 免費方案有 0.5GB,對示範與試用
// 的量體綽綽有餘。真的成長到需要專用物件儲存時,只要設定 BLOB_READ_WRITE_TOKEN,
// storage.ts 會自動改走 Blob,呼叫端一行都不用改(這正是當初把儲存收斂成
// saveFile/readFile/deleteFile 三個函式的用意)。
//
// 刻意獨立一張表,而不是在 attachments 上加一個 bytea 欄位:attachments 會被列表
// 頁頻繁查詢,而 storage.ts 是一層與業務無關的通用儲存介面,不應該反過來依賴
// attachments 這張業務表。兩者以 storedFilename 這個「儲存端識別碼」相連。
export const fileBlobs = pgTable("file_blobs", {
  storedFilename: text("stored_filename").primaryKey(), // 對應 attachments.storedFilename
  data: bytea("data").notNull(),
  mimeType: text("mime_type").notNull().default(""),
  sizeBytes: integer("size_bytes").notNull().default(0),
  createdAt: now("created_at"),
});
