// 分類樹資料存取(學院→系所→領域→子領域→教授)
// 換資料庫/ORM 時,只需改寫本目錄下的檔案,頁面層不動。
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { asc, eq, inArray } from "drizzle-orm";

export async function listColleges() {
  return db.select().from(t.colleges).orderBy(asc(t.colleges.sortOrder));
}

export async function getCollegeWithDepartments(slug: string) {
  const [college] = await db.select().from(t.colleges).where(eq(t.colleges.slug, slug));
  if (!college) return null;
  const departments = await db.select().from(t.departments)
    .where(eq(t.departments.collegeId, college.id))
    .orderBy(asc(t.departments.sortOrder));
  return { college, departments };
}

export async function getDepartmentTree(collegeSlug: string, deptSlug: string) {
  const found = await getCollegeWithDepartments(collegeSlug);
  if (!found) return null;
  const dept = found.departments.find((d) => d.slug === deptSlug);
  if (!dept) return null;

  const fieldRows = await db.select().from(t.fields)
    .where(eq(t.fields.departmentId, dept.id)).orderBy(asc(t.fields.sortOrder));
  const fieldIds = fieldRows.map((f) => f.id);
  const subRows = fieldIds.length
    ? await db.select().from(t.subfields)
        .where(inArray(t.subfields.fieldId, fieldIds)).orderBy(asc(t.subfields.sortOrder))
    : [];

  const professors = await db.select().from(t.professorProfiles)
    .where(eq(t.professorProfiles.departmentId, dept.id));

  return {
    college: found.college,
    dept,
    fields: fieldRows.map((f) => ({ ...f, subfields: subRows.filter((s) => s.fieldId === f.id) })),
    professors,
  };
}

export async function getSubfieldWithProfessors(subfieldId: string) {
  const [sub] = await db.select().from(t.subfields).where(eq(t.subfields.id, subfieldId));
  if (!sub) return null;
  const [field] = await db.select().from(t.fields).where(eq(t.fields.id, sub.fieldId));
  const [dept] = await db.select().from(t.departments).where(eq(t.departments.id, field.departmentId));
  const [college] = await db.select().from(t.colleges).where(eq(t.colleges.id, dept.collegeId));

  const links = await db.select().from(t.professorSpecialties)
    .where(eq(t.professorSpecialties.subfieldId, subfieldId));
  const profIds = links.map((l) => l.professorId);
  const professors = profIds.length
    ? await db.select().from(t.professorProfiles).where(inArray(t.professorProfiles.id, profIds))
    : [];
  return { sub, field, dept, college, professors };
}
