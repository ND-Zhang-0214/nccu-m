// 白皮書 §2.3.1「可受理的學生請求」設定區 + §2.9 推薦信 / §2.10 大專生計畫等
// 「學生 → 教授」結構化請求(2026-08 新增)。
//
// 技術原則(白皮書明文要求,§2.3.1):「此五項應由同一支函式帶不同參數實作,而非分別
// 撰寫五套邏輯」——本檔案的 upsertIntakeSetting/respondToRequest 即為該共用函式,
// 靠 type 參數分流,不為五種類型各寫一套。
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { INTAKE_TYPE_ORDER, type IntakeType } from "@/shared/categories";

export { INTAKE_TYPE_ORDER } from "@/shared/categories";

// ── 教授「可受理的學生請求」五項開關(§2.3.1)──────────────────────

/** 回傳教授五項設定的完整清單(即使資料庫尚無列,也補上預設關閉的空值,方便畫面渲染)。 */
export async function getIntakeSettingsForProfessor(professorId: string) {
  const rows = await db.select().from(t.professorIntakeSettings)
    .where(eq(t.professorIntakeSettings.professorId, professorId));
  const byType = new Map(rows.map((r) => [r.type, r]));
  return INTAKE_TYPE_ORDER.map((type) => byType.get(type) ?? {
    id: "", professorId, type, enabled: false, conditionText: "", quotaNote: "", updatedAt: null,
  });
}

export async function getIntakeSetting(professorId: string, type: IntakeType) {
  const [row] = await db.select().from(t.professorIntakeSettings)
    .where(and(eq(t.professorIntakeSettings.professorId, professorId), eq(t.professorIntakeSettings.type, type)));
  return row ?? null;
}

export async function upsertIntakeSetting(
  professorId: string, type: IntakeType,
  input: { enabled: boolean; conditionText: string; quotaNote: string },
) {
  const existing = await getIntakeSetting(professorId, type);
  if (existing) {
    const [row] = await db.update(t.professorIntakeSettings)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(t.professorIntakeSettings.id, existing.id)).returning();
    return row;
  }
  const [row] = await db.insert(t.professorIntakeSettings)
    .values({ professorId, type, ...input }).returning();
  return row;
}

// ── 學生 → 教授請求(§2.9/§2.10/§2.1 學生發起事由)────────────────────

const TERMINAL_STATUSES = ["declined", "sent", "declined_after_accept"];
// UR/LAB_JOIN/EXT_ENDORSE 沒有 §2.9 那組「撰寫中」中介狀態,accepted 即為終局(後續指導關係走平台外程序)。
const NON_REC_TERMINAL_STATUSES = [...TERMINAL_STATUSES, "accepted"];

/** 同一學生對同一教授、同一類型,若已有未結案的請求,不可重複發起(比照 postings 的不可重複申請)。 */
export async function hasActiveRequest(studentId: string, professorId: string, type: IntakeType) {
  const terminal = type === "REC" ? TERMINAL_STATUSES : NON_REC_TERMINAL_STATUSES;
  const rows = await db.select({ id: t.studentRequests.id, status: t.studentRequests.status })
    .from(t.studentRequests)
    .where(and(
      eq(t.studentRequests.studentId, studentId),
      eq(t.studentRequests.professorId, professorId),
      eq(t.studentRequests.type, type),
    ));
  return rows.some((r) => !terminal.includes(r.status));
}

export async function createStudentRequest(input: {
  type: IntakeType; studentId: string; professorId: string; payload: Record<string, unknown>;
}) {
  const [row] = await db.insert(t.studentRequests).values({
    type: input.type, studentId: input.studentId, professorId: input.professorId,
    payload: JSON.stringify(input.payload),
  }).returning();
  return row;
}

export async function getStudentRequest(id: string) {
  const [row] = await db.select().from(t.studentRequests).where(eq(t.studentRequests.id, id));
  return row ?? null;
}

export class InvalidTransitionError extends Error {}

/** 教授對請求的回應:接受 / 婉拒 / 希望先談談。REC 類型接受後進入「撰寫中」,
 *  其餘三類接受後直接視為終局(白皮書僅 REC 定義撰寫中介狀態)。 */
export async function respondToRequest(requestId: string, decision: "accept" | "decline" | "want_to_talk") {
  const row = await getStudentRequest(requestId);
  if (!row) throw new InvalidTransitionError("找不到此請求。");
  if (row.status !== "pending" && row.status !== "wants_to_talk") {
    throw new InvalidTransitionError("此請求目前狀態不可再回應。");
  }
  if (decision === "want_to_talk" && row.status !== "pending") {
    throw new InvalidTransitionError("已回應過一次,不可再次標記為「希望先談談」。");
  }
  const nextStatus =
    decision === "want_to_talk" ? "wants_to_talk" :
    decision === "decline" ? "declined" :
    row.type === "REC" ? "writing" : "accepted";
  const [updated] = await db.update(t.studentRequests)
    .set({ status: nextStatus, statusUpdatedAt: new Date() })
    .where(eq(t.studentRequests.id, requestId)).returning();
  return updated;
}

/** REC 專屬:撰寫中 → 已送出 / 了解後婉拒(白皮書 2.9)。其他類型呼叫此函式一律拒絕。 */
export async function finalizeRecommendation(requestId: string, outcome: "sent" | "declined_after_accept") {
  const row = await getStudentRequest(requestId);
  if (!row) throw new InvalidTransitionError("找不到此請求。");
  if (row.type !== "REC") throw new InvalidTransitionError("僅推薦信類型有「撰寫中」後續狀態。");
  if (row.status !== "writing") throw new InvalidTransitionError("此請求不在撰寫中狀態。");
  const [updated] = await db.update(t.studentRequests)
    .set({ status: outcome, statusUpdatedAt: new Date() })
    .where(eq(t.studentRequests.id, requestId)).returning();
  return updated;
}

/** 「我的請求」進度追蹤用(比照 listMyApplications)。 */
export async function listMyStudentRequests(studentId: string) {
  const rows = await db.select().from(t.studentRequests)
    .where(eq(t.studentRequests.studentId, studentId))
    .orderBy(desc(t.studentRequests.createdAt));
  const profIds = [...new Set(rows.map((r) => r.professorId))];
  const profs = profIds.length
    ? await db.select().from(t.professorProfiles).where(inArray(t.professorProfiles.id, profIds))
    : [];
  const byId = new Map(profs.map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, professor: byId.get(r.professorId)! }));
}

/** 教授端「收到的學生請求」清單(比照 listApplicationsForPosting)。 */
export async function listIncomingRequestsForProfessor(professorId: string) {
  const rows = await db.select().from(t.studentRequests)
    .where(eq(t.studentRequests.professorId, professorId))
    .orderBy(desc(t.studentRequests.createdAt));
  const studentIds = [...new Set(rows.map((r) => r.studentId))];
  const students = studentIds.length
    ? await db.select().from(t.users).where(inArray(t.users.id, studentIds))
    : [];
  const byId = new Map(students.map((u) => [u.id, u]));
  return rows.map((r) => ({ ...r, student: byId.get(r.studentId)! }));
}
