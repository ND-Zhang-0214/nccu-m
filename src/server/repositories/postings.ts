import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";

export const CATEGORIES: Record<string, string> = {
  TA: "課程助教", DEPT: "系辦短期", UR: "大專生計畫", REC: "推薦信", IND: "產學/跨域",
};

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
