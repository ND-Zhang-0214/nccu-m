import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";

export { CATEGORIES } from "@/shared/categories";

// 白皮書 2.1:發起方可能是教授、單位或學生,2026-08 第二輪起 postings 不再假設一定有 professorId。
// 這支函式把「這則需求是誰發的」統一整理成 { posterName, posterHref } 給下游頁面直接顯示,
// 不用每個頁面都各自寫一次 posterType 判斷。posterHref 為 null 代表沒有可連結的公開頁面
// (單位帳號、學生本人目前都沒有像教授檔案一樣的公開頁)。
async function attachPosterInfo<T extends { posterType: string; professorId: string | null; unitId: string | null; studentPosterId: string | null }>(
  rows: T[],
): Promise<(T & { posterName: string; posterHref: string | null; professor: any; posterUserId: string | null })[]> {
  const profIds = [...new Set(rows.filter((r) => r.professorId).map((r) => r.professorId as string))];
  const unitIds = [...new Set(rows.filter((r) => r.unitId).map((r) => r.unitId as string))];
  const studentIds = [...new Set(rows.filter((r) => r.studentPosterId).map((r) => r.studentPosterId as string))];

  const [profs, units, students] = await Promise.all([
    profIds.length ? db.select().from(t.professorProfiles).where(inArray(t.professorProfiles.id, profIds)) : Promise.resolve([]),
    unitIds.length ? db.select().from(t.unitProfiles).where(inArray(t.unitProfiles.id, unitIds)) : Promise.resolve([]),
    studentIds.length ? db.select().from(t.users).where(inArray(t.users.id, studentIds)) : Promise.resolve([]),
  ]);
  const profById = new Map(profs.map((p) => [p.id, p]));
  const unitById = new Map(units.map((u) => [u.id, u]));
  const studentById = new Map(students.map((s) => [s.id, s]));

  return rows.map((r) => {
    if (r.posterType === "UNIT" && r.unitId) {
      const u = unitById.get(r.unitId);
      // posterUserId:不論發起方是誰,一律解析回「哪個 users.id 有權管理這則需求」,
      // 讓頁面判斷 isOwner 時不用再自己分岔 posterType——見 postings/[id]/page.tsx。
      return { ...r, posterName: u?.name ?? "(單位帳號)", posterHref: null, professor: null, posterUserId: u?.userId ?? null };
    }
    if (r.posterType === "STUDENT" && r.studentPosterId) {
      const s = studentById.get(r.studentPosterId);
      return { ...r, posterName: s?.displayName ?? "(學生)", posterHref: null, professor: null, posterUserId: r.studentPosterId };
    }
    const p = r.professorId ? profById.get(r.professorId) : undefined;
    return { ...r, posterName: p?.displayName ?? "(教授)", posterHref: p ? `/professors/${p.id}` : null, professor: p ?? null, posterUserId: p?.userId ?? null };
  }) as any;
}

export async function listOpenPostings(category?: string) {
  const cond = category
    ? and(eq(t.postings.isOpen, true), eq(t.postings.category, category))
    : eq(t.postings.isOpen, true);
  const rows = await db.select().from(t.postings).where(cond).orderBy(desc(t.postings.createdAt));
  return attachPosterInfo(rows);
}

// 白皮書 2.6.1:學生合作專區六分區,發布後系統依類型自動歸入分區各自呈現——
// 這裡先撈出全部六分區的開放邀集,分區呈現交給頁面依 category 分組(見 /collab)。
export async function listOpenCollabPostings() {
  const { STUDENT_COLLAB_CATEGORY_ORDER } = await import("@/shared/categories");
  const rows = await db.select().from(t.postings)
    .where(and(eq(t.postings.isOpen, true), inArray(t.postings.category, STUDENT_COLLAB_CATEGORY_ORDER)))
    .orderBy(desc(t.postings.createdAt));
  return attachPosterInfo(rows);
}

// 白皮書 2.8.3:已關閉的需求歸入獨立分區,但發文者/申請者/管理員仍可查詢(不可真刪除)。
export async function listClosedPostings(category?: string) {
  const cond = category
    ? and(eq(t.postings.isOpen, false), eq(t.postings.category, category))
    : eq(t.postings.isOpen, false);
  const rows = await db.select().from(t.postings).where(cond).orderBy(desc(t.postings.createdAt));
  return attachPosterInfo(rows);
}

// 教授/單位/學生發布新需求(白皮書 2.1 二維模型;2026-08 第二輪起支援三種發起方)。
export async function createPosting(input: {
  posterType: "PROFESSOR" | "UNIT" | "STUDENT";
  professorId?: string | null; unitId?: string | null; studentPosterId?: string | null;
  category: string; title: string; description: string;
  structuredFields?: Record<string, unknown>;
}) {
  const [row] = await db.insert(t.postings).values({
    posterType: input.posterType,
    professorId: input.professorId ?? null,
    unitId: input.unitId ?? null,
    studentPosterId: input.studentPosterId ?? null,
    category: input.category,
    title: input.title,
    description: input.description,
    structuredFields: JSON.stringify(input.structuredFields ?? {}),
  }).returning();
  return row;
}

export async function getPosting(id: string) {
  const [row] = await db.select().from(t.postings).where(eq(t.postings.id, id));
  if (!row) return null;
  const [withPoster] = await attachPosterInfo([row]);
  return withPoster;
}

// 白皮書 2.8.1/2.8.2:發布後仍可編輯,但每次寫入編輯歷史(存「編輯前」快照),
// 版本號遞增,供 2.8.2 的分層可見範圍與申請時的版本快照使用。
export async function editPosting(
  postingId: string,
  editorUserId: string,
  changes: { title: string; description: string; structuredFields?: Record<string, unknown> },
) {
  const [current] = await db.select().from(t.postings).where(eq(t.postings.id, postingId));
  if (!current) throw new Error("找不到此需求");

  await db.insert(t.postingVersions).values({
    postingId,
    versionNumber: current.currentVersion,
    title: current.title,
    description: current.description,
    structuredFields: current.structuredFields,
    editedByUserId: editorUserId,
  });

  const [updated] = await db.update(t.postings).set({
    title: changes.title,
    description: changes.description,
    structuredFields: JSON.stringify(changes.structuredFields ?? JSON.parse(current.structuredFields || "{}")),
    currentVersion: current.currentVersion + 1,
  }).where(eq(t.postings.id, postingId)).returning();
  return updated;
}

// 白皮書 2.8.2:一般瀏覽者與已提出申請者皆可見「當前內容」;完整編輯歷史則依原文附帶的設計理由
// (避免教授的修改過程對未申請者完全公開而降低使用意願)僅開放給申請者與管理員——
// 這裡的表格本身寫「一般瀏覽者也可查詢完整編輯歷史」與同段理由文字互相矛盾,
// 交付文件已誠實列出此處落差,程式碼採信理由段落(較嚴謹的一方)。
export async function getPostingVersions(postingId: string) {
  return db.select().from(t.postingVersions)
    .where(eq(t.postingVersions.postingId, postingId))
    .orderBy(desc(t.postingVersions.versionNumber));
}

// 白皮書 2.8.3:不可真刪除,僅可關閉,自動歸入「已關閉」分區。
export async function closePosting(postingId: string, reason = "") {
  const [row] = await db.update(t.postings).set({ isOpen: false, closedReason: reason })
    .where(eq(t.postings.id, postingId)).returning();
  return row;
}

export async function reopenPosting(postingId: string) {
  const [row] = await db.update(t.postings).set({ isOpen: true, closedReason: "" })
    .where(eq(t.postings.id, postingId)).returning();
  return row;
}

export async function createApplication(input: {
  postingId: string; applicantId: string; motivation: string; payload: Record<string, unknown>;
}) {
  const [posting] = await db.select().from(t.postings).where(eq(t.postings.id, input.postingId));
  const [row] = await db.insert(t.applications).values({
    postingId: input.postingId,
    applicantId: input.applicantId,
    motivation: input.motivation,
    payload: JSON.stringify(input.payload),
    appliedAtVersion: posting?.currentVersion ?? 1, // 白皮書2.8.1:記錄申請當下的貼文版本,供日後對照
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
  const [row] = await db.update(t.applications).set({ status, statusUpdatedAt: new Date() })
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

export async function getMyApplicationForPosting(postingId: string, applicantId: string) {
  const [row] = await db.select().from(t.applications)
    .where(and(eq(t.applications.postingId, postingId), eq(t.applications.applicantId, applicantId)));
  return row ?? null;
}

// 教授儀表板用:自己發布的全部需求(含關閉的)
export async function listPostingsByProfessor(professorId: string) {
  return db.select().from(t.postings)
    .where(eq(t.postings.professorId, professorId))
    .orderBy(desc(t.postings.createdAt));
}

export async function listPostingsByUnit(unitId: string) {
  return db.select().from(t.postings)
    .where(eq(t.postings.unitId, unitId))
    .orderBy(desc(t.postings.createdAt));
}

export async function listPostingsByStudent(studentId: string) {
  return db.select().from(t.postings)
    .where(eq(t.postings.studentPosterId, studentId))
    .orderBy(desc(t.postings.createdAt));
}

// 首頁「為你精選」用:非個人化版本(依最近開放需求輪替取樣)
export async function listFeaturedPostings(excludeIds: string[], limit = 4) {
  const all = await db.select().from(t.postings).where(eq(t.postings.isOpen, true));
  const pool = all.filter((p) => !excludeIds.includes(p.id));
  const picked = pool.slice(0, limit);
  return attachPosterInfo(picked);
}
