import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { eq, inArray, and, desc } from "drizzle-orm";

export async function getProfessor(id: string) {
  const [prof] = await db.select().from(t.professorProfiles).where(eq(t.professorProfiles.id, id));
  if (!prof) return null;
  const [dept] = await db.select().from(t.departments).where(eq(t.departments.id, prof.departmentId));
  const [college] = await db.select().from(t.colleges).where(eq(t.colleges.id, dept.collegeId));

  const links = await db.select().from(t.professorSpecialties)
    .where(eq(t.professorSpecialties.professorId, id));
  const subIds = links.map((l) => l.subfieldId);
  const specialties = subIds.length
    ? await db.select().from(t.subfields).where(inArray(t.subfields.id, subIds))
    : [];

  const openPostings = await db.select().from(t.postings)
    .where(and(eq(t.postings.professorId, id), eq(t.postings.isOpen, true)))
    .orderBy(desc(t.postings.createdAt));

  return { prof, dept, college, specialties, openPostings };
}

export async function getProfessorByUserId(userId: string) {
  const [prof] = await db.select().from(t.professorProfiles).where(eq(t.professorProfiles.userId, userId));
  return prof ?? null;
}

// 新手引導清單用:回報教授檔案的完成度(檔案簡介/研究專長/已發布需求)
export async function getProfessorOnboarding(professorId: string) {
  const [prof] = await db.select().from(t.professorProfiles).where(eq(t.professorProfiles.id, professorId));
  const specialties = await db.select().from(t.professorSpecialties)
    .where(eq(t.professorSpecialties.professorId, professorId));
  const postings = await db.select().from(t.postings).where(eq(t.postings.professorId, professorId));
  return {
    hasBio: !!prof?.bio,
    hasSpecialties: specialties.length > 0,
    hasPosting: postings.length > 0,
  };
}

export async function listPendingProfessors() {
  return db.select().from(t.professorProfiles).where(eq(t.professorProfiles.verifyStatus, "PENDING"));
}

export async function setProfessorVerify(id: string, status: "APPROVED" | "REJECTED") {
  await db.update(t.professorProfiles).set({ verifyStatus: status }).where(eq(t.professorProfiles.id, id));
}

export async function addProfessorSpecialty(professorId: string, subfieldId: string) {
  await db.insert(t.professorSpecialties).values({ professorId, subfieldId }).onConflictDoNothing();
}

/** 教授所屬系所底下的全部子領域名稱,供 AI 標籤建議時的候選清單使用。 */
export async function listCandidateSubfieldsForProfessor(professorId: string) {
  const [prof] = await db.select().from(t.professorProfiles).where(eq(t.professorProfiles.id, professorId));
  if (!prof) return [];
  const fields = await db.select().from(t.fields).where(eq(t.fields.departmentId, prof.departmentId));
  if (fields.length === 0) return [];
  const { inArray } = await import("drizzle-orm");
  return db.select().from(t.subfields).where(inArray(t.subfields.fieldId, fields.map((f) => f.id)));
}
