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
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
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

export const auditLogs = sqliteTable("audit_logs", {
  id: id(),
  actorId: text("actor_id").references(() => users.id),
  action: text("action").notNull(),
  targetType: text("target_type").notNull().default(""),
  targetId: text("target_id").notNull().default(""),
  meta: text("meta").notNull().default("{}"),
  createdAt: now("created_at"),
}, (t) => ({ timeIdx: index("al_time").on(t.createdAt) }));
