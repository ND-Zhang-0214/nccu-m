import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";

export { CATEGORIES } from "@/shared/categories";

export async function listOpenPostings(category?: string) {
  const cond = category
    ? and(eq(t.postings.isOpen, true), eq(t.postings.category, category))
    : eq(t.postings.isOpen, true);
  const rows = await db.select().from(t.postings).where(cond).orderBy(desc(t.postings.createdAt));
  const profIds = [...new Set(rows.map((r) => r.professorId))];
  const profs = profIds.length
    ? await db.select().from(t.professorProfiles).where(inArray(t.professorProfiles.id, profIds))
    : [];
  const byId = new Map(profs.map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, professor: byId.get(r.professorId)! }));
}

export async function getPosting(id: string) {
  const [row] = await db.select().from(t.postings).where(eq(t.postings.id, id));
  if (!row) return null;
  const [prof] = await db.select().from(t.professorProfiles)
    .where(eq(t.professorProfiles.id, row.professorId));
  return { ...row, professor: prof };
}

export async function createApplication(input: {
  postingId: string; applicantId: string; motivation: string; payload: Record<string, unknown>;
}) {
  const [row] = await db.insert(t.applications).values({
    postingId: input.postingId,
    applicantId: input.applicantId,
    motivation: input.motivation,
    payload: JSON.stringify(input.payload),
  }).returning();
  return row;
}

// 教授「並排比較申請」用:同一需求底下的全部申請,附申請人暱稱
export async function listApplicationsForPosting(postingId: string) {
  const rows = await db.select().from(t.applications)
    .where(eq(t.applications.postingId, postingId))
    .orderBy(desc(t.applications.createdAt));
  const applicantIds = [...new Set(rows.map((r) => r.applicantId))];
  const applicants = applicantIds.length
    ? await db.select().from(t.users).where(inArray(t.users.id, applicantIds))
    : [];
  const byId = new Map(applicants.map((u) => [u.id, u]));
  return rows.map((r) => ({ ...r, applicant: byId.get(r.applicantId)! }));
}

export async function updateApplicationStatus(id: string, status: string) {
  const [row] = await db.update(t.applications).set({ status })
    .where(eq(t.applications.id, id)).returning();
  return row;
}

export async function getApplication(id: string) {
  const [row] = await db.select().from(t.applications).where(eq(t.applications.id, id));
  return row ?? null;
}

// 「我的申請」進度追蹤用
export async function listMyApplications(applicantId: string) {
  const rows = await db.select().from(t.applications)
    .where(eq(t.applications.applicantId, applicantId))
    .orderBy(desc(t.applications.createdAt));
  const postingIds = [...new Set(rows.map((r) => r.postingId))];
  const posts = postingIds.length
    ? await db.select().from(t.postings).where(inArray(t.postings.id, postingIds))
    : [];
  const byId = new Map(posts.map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, posting: byId.get(r.postingId)! }));
}

// 教授儀表板用:自己發布的全部需求(含關閉的)
export async function listPostingsByProfessor(professorId: string) {
  return db.select().from(t.postings)
    .where(eq(t.postings.professorId, professorId))
    .orderBy(desc(t.postings.createdAt));
}

// 首頁「為你精選」用:非個人化版本(依最近開放需求輪替取樣)
// 註:真正的個人化需要先建立使用者興趣/瀏覽紀錄追蹤,目前平台尚無此資料,故此為過渡版本。
export async function listFeaturedPostings(excludeIds: string[], limit = 4) {
  const all = await db.select().from(t.postings).where(eq(t.postings.isOpen, true));
  const pool = all.filter((p) => !excludeIds.includes(p.id));
  const picked = pool.slice(0, limit);
  const profIds = [...new Set(picked.map((p) => p.professorId))];
  const profs = profIds.length
    ? await db.select().from(t.professorProfiles).where(inArray(t.professorProfiles.id, profIds))
    : [];
  const byId = new Map(profs.map((p) => [p.id, p]));
  return picked.map((p) => ({ ...p, professor: byId.get(p.professorId)! }));
}
