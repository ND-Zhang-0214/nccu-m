// 使用者本人可自行操作的個人設定:顯示名稱、學制標記、隱藏(靜音)清單、登入裝置清單。
// 白皮書 2.2.2/2.2.3/2.12.2/3.2.5。
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { and, desc, eq, ne } from "drizzle-orm";
import { audit } from "@/server/repositories/audit";

// 白皮書 2.2.2:顯示名稱可申請修改,但要留紀錄(稽核鏈已提供雜湊鏈存證機制,直接沿用)。
// realName 不變動——這正是分離兩個欄位的目的:realName 供內部查證,displayName 給使用者自主權。
export async function updateDisplayName(userId: string, newName: string) {
  const [before] = await db.select({ displayName: t.users.displayName }).from(t.users).where(eq(t.users.id, userId));
  await db.update(t.users).set({ displayName: newName }).where(eq(t.users.id, userId));
  await audit(userId, "user.display_name.update", "USER", userId, { from: before?.displayName ?? "", to: newName });
}

// 白皮書 2.2.3:學制為自填,預設未驗證。首次使用「自行發布需求找幫手」(GRAD_HELPER 類別)
// 才需要驗證,驗證方式為該所教授或指導教授確認——demo 環境簡化為:任一位已認領帳號的教授
// 皆可代為確認(白皮書原文本身也把驗證方式標成「可討論」,非唯一定案做法)。
export async function setDegreeLevel(userId: string, degreeLevel: "BACHELOR" | "MASTER" | "PHD") {
  await db.update(t.users).set({ degreeLevel, degreeLevelVerifiedAt: null }).where(eq(t.users.id, userId));
}

export async function verifyDegreeLevel(userId: string, verifierUserId: string) {
  await db.update(t.users).set({ degreeLevelVerifiedAt: new Date() }).where(eq(t.users.id, userId));
  await audit(verifierUserId, "user.degree_level.verify", "USER", userId);
}

export function isGradStudent(user: { role: string; degreeLevel: string | null }): boolean {
  // 兩個訊號並存(見 schema.ts 註解):既有 role=STUDENT_GRAD,或白皮書新增的自填 degreeLevel。
  return user.role === "STUDENT_GRAD" || user.degreeLevel === "MASTER" || user.degreeLevel === "PHD";
}

/** 白皮書 2.2.3/2.4.1:「自行發布需求找幫手」(GRAD_HELPER)專用的較嚴格判斷——
 *  role=STUDENT_GRAD 是既有訊號(帳號建立當下即已確立,不需要再驗證);但白皮書新增的
 *  自填 degreeLevel 明文要求「僅在要用此功能時才需要驗證」,所以自填路徑必須額外檢查
 *  degreeLevelVerifiedAt。刻意不改動 isGradStudent() 本身(它是較寬鬆的「概念上算不算
 *  研究生」判斷,可能有其他情境會用到),這裡另外寫一支給「能不能發文」這個較嚴格的問題。 */
export function canCreateGradHelperPosting(user: { role: string; degreeLevel: string | null; degreeLevelVerifiedAt: Date | null }): boolean {
  if (user.role === "STUDENT_GRAD") return true;
  return (user.degreeLevel === "MASTER" || user.degreeLevel === "PHD") && user.degreeLevelVerifiedAt !== null;
}

export async function getUserByEmail(email: string) {
  const [row] = await db.select().from(t.users).where(eq(t.users.email, email));
  return row ?? null;
}

// ── 白皮書 2.12.2 使用者隱藏(靜音)────────────────────────────────────
export async function hideUser(hiderUserId: string, hiddenUserId: string) {
  if (hiderUserId === hiddenUserId) throw new Error("不能隱藏自己");
  await db.insert(t.userHides).values({ hiderUserId, hiddenUserId }).onConflictDoNothing();
}

export async function unhideUser(hiderUserId: string, hiddenUserId: string) {
  await db.delete(t.userHides).where(
    and(eq(t.userHides.hiderUserId, hiderUserId), eq(t.userHides.hiddenUserId, hiddenUserId)),
  );
}

export async function listHiddenUsers(hiderUserId: string) {
  const rows = await db.select().from(t.userHides).where(eq(t.userHides.hiderUserId, hiderUserId));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.hiddenUserId);
  const users = await db.select({ id: t.users.id, displayName: t.users.displayName }).from(t.users);
  const byId = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => ({ ...r, hidden: byId.get(r.hiddenUserId) }));
}

// 規則(白皮書 2.12.2):隱藏方看不到對方內容、被隱藏方不會收到通知也不知情,但無法與隱藏方
// 互動(如另開群組/開始新對話)。既有群組不受影響,只在群組內顯示「使用者已隱藏」。
export async function isHiddenEitherWay(userIdA: string, userIdB: string): Promise<boolean> {
  const [row] = await db.select({ id: t.userHides.id }).from(t.userHides).where(
    and(eq(t.userHides.hiderUserId, userIdA), eq(t.userHides.hiddenUserId, userIdB)),
  );
  return !!row;
}

// 「被隱藏方不無法與隱藏方互動」需要雙向檢查(不論誰主動發起互動,只要任一方設了隱藏就擋)。
export async function hasHideRelationship(userIdA: string, userIdB: string): Promise<boolean> {
  const aHidB = await isHiddenEitherWay(userIdA, userIdB);
  if (aHidB) return true;
  return isHiddenEitherWay(userIdB, userIdA);
}

// ── 白皮書 3.2.5 登入裝置清單與強制登出 ─────────────────────────────
export async function listMySessions(userId: string) {
  return db.select().from(t.sessions).where(eq(t.sessions.userId, userId)).orderBy(desc(t.sessions.lastUsedAt));
}

// 只允許刪除「自己的」session,不接受任意 sessionId(見 actions.ts 呼叫端會再核對 userId)。
export async function revokeSession(userId: string, sessionId: string) {
  await db.delete(t.sessions).where(and(eq(t.sessions.id, sessionId), eq(t.sessions.userId, userId)));
}

export async function revokeAllOtherSessions(userId: string, keepSessionId: string) {
  await db.delete(t.sessions).where(and(eq(t.sessions.userId, userId), ne(t.sessions.id, keepSessionId)));
}
