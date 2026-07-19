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

export async function listPendingProfessors() {
  return db.select().from(t.professorProfiles).where(eq(t.professorProfiles.verifyStatus, "PENDING"));
}

export async function setProfessorVerify(id: string, status: "APPROVED" | "REJECTED") {
  await db.update(t.professorProfiles).set({ verifyStatus: status }).where(eq(t.professorProfiles.id, id));
}
