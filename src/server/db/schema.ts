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
  payload: text("payload").notNull().default("{}"), // 類別專屬欄位(JSON)
  createdAt: now("created_at"),
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

// ── §2.5 管理員敏感調閱雙人核可 ──────────────────────────

export const dualApprovals = sqliteTable("dual_approvals", {
  id: id(),
  requesterId: text("requester_id").notNull().references(() => users.id),
  action: text("action").notNull(), // 欲執行的動作代碼,如 audit.view_sensitive
  targetType: text("target_type").notNull().default(""),
  targetId: text("target_id").notNull().default(""),
  status: text("status").notNull().default("pending"), // pending | approved | rejected | expired
  approverId: text("approver_id").references(() => users.id),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: now("created_at"),
}, (t) => ({ statusIdx: index("da_status").on(t.status, t.createdAt) }));
