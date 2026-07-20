// M7 面試時段預約 + ics 行事曆同步
// ─────────────────────────────────────────────────────────────
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { and, eq, gte, or } from "drizzle-orm";
import { randomBytes, createHash } from "node:crypto";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const ICS_TOKEN_VALID_MS = 150 * 24 * 3600_000; // §7:90–180 天到期,取中間值 150 天

export async function createSlots(postingId: string, professorId: string, slots: Array<{ startAt: Date; endAt: Date; location: string }>) {
  if (slots.length === 0) return [];
  return db.insert(t.interviewSlots).values(
    slots.map((s) => ({ postingId, professorId, startAt: s.startAt, endAt: s.endAt, location: s.location })),
  ).returning();
}

/** 開放中的時段列表:地點資訊在此刻意不回傳(媒合後才揭露),只有預約後才給地點。 */
export async function listOpenSlotsForPosting(postingId: string) {
  const rows = await db.select().from(t.interviewSlots)
    .where(and(eq(t.interviewSlots.postingId, postingId), eq(t.interviewSlots.isBooked, false), gte(t.interviewSlots.startAt, new Date())));
  return rows.map(({ location, ...rest }) => rest); // 未預約前不回傳地點欄位
}

export async function bookSlot(slotId: string, applicationId: string) {
  // 用 WHERE isBooked=false 做條件更新,避免兩人同時搶同一時段的競態條件(原子操作)
  const result = await db.update(t.interviewSlots)
    .set({ isBooked: true, applicationId })
    .where(and(eq(t.interviewSlots.id, slotId), eq(t.interviewSlots.isBooked, false)))
    .returning();
  return result[0] ?? null; // null 代表時段已被別人搶先預約
}

export async function getSlot(id: string) {
  const [row] = await db.select().from(t.interviewSlots).where(eq(t.interviewSlots.id, id));
  return row ?? null;
}

/** 我的面試時段(以學生身分):只回傳「我已預約」的時段,含地點(此時已媒合確認,地點可見)。 */
export async function listMyBookedSlots(applicantId: string) {
  const apps = await db.select().from(t.applications).where(eq(t.applications.applicantId, applicantId));
  if (apps.length === 0) return [];
  const { inArray } = await import("drizzle-orm");
  return db.select().from(t.interviewSlots).where(inArray(t.interviewSlots.applicationId, apps.map((a) => a.id)));
}

/** 我開放/管理的時段(以教授身分)。 */
export async function listSlotsByProfessor(professorId: string) {
  return db.select().from(t.interviewSlots).where(eq(t.interviewSlots.professorId, professorId));
}

// ── ics 行事曆訂閱 ────────────────────────────────────────

export async function issueIcsToken(userId: string): Promise<string> {
  const token = randomBytes(24).toString("hex");
  await db.insert(t.icsTokens).values({ userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ICS_TOKEN_VALID_MS) });
  return token;
}

export async function resolveIcsToken(token: string) {
  const [row] = await db.select().from(t.icsTokens)
    .where(and(eq(t.icsTokens.tokenHash, sha256(token)), gte(t.icsTokens.expiresAt, new Date())));
  return row ?? null;
}

/** 產生 .ics 內容:涵蓋此使用者未來的面試時段(不論是教授身分開放的、或學生身分預約的)。
 *  內容刻意最小化,只含時間地點,不含對方個資(架構規格 §7)。 */
export async function generateIcsFeed(userId: string): Promise<string> {
  const now = new Date();
  const asProfessor = await db.select().from(t.interviewSlots).innerJoin(
    t.professorProfiles, eq(t.professorProfiles.id, t.interviewSlots.professorId),
  ).where(and(eq(t.professorProfiles.userId, userId), gte(t.interviewSlots.startAt, now), eq(t.interviewSlots.isBooked, true)));

  const asApplicant = await db.select().from(t.interviewSlots).innerJoin(
    t.applications, eq(t.applications.id, t.interviewSlots.applicationId),
  ).where(and(eq(t.applications.applicantId, userId), gte(t.interviewSlots.startAt, now)));

  const events = [
    ...asProfessor.map((r) => r.interview_slots),
    ...asApplicant.map((r) => r.interview_slots),
  ];

  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//NCCU Research Match//ics//ZH",
    ...events.map((e) => [
      "BEGIN:VEVENT",
      `UID:${e.id}@nccu-research-match`,
      `DTSTART:${fmt(e.startAt)}`,
      `DTEND:${fmt(e.endAt)}`,
      `SUMMARY:研究媒合面試`,
      e.location ? `LOCATION:${e.location.replace(/\n/g, " ")}` : "",
      "END:VEVENT",
    ].filter(Boolean).join("\r\n")),
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}
