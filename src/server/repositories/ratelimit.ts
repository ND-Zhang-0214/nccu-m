// 登入速率限制與階梯式鎖定(§2.3)
// ─────────────────────────────────────────────────────────────
// 正式環境上量後建議換 Redis(高頻寫入、原生過期,效能更好);介面收斂於此檔,
// 換底層儲存時只改本檔實作,呼叫端(auth.ts / API route)不需改動。
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { and, eq, gte, count } from "drizzle-orm";
import { logSecurityEvent } from "./security";

const WINDOWS = {
  emailShort: { ms: 60_000, max: 1 },        // 同一 email:60 秒內至多 1 次驗證碼請求
  emailLong: { ms: 10 * 60_000, max: 5 },    // 同一 email:10 分鐘內至多 5 次
  ipLong: { ms: 10 * 60_000, max: 20 },      // 同一 IP:10 分鐘內至多 20 次(跨不同 email)
};
const VERIFY_LOCK_THRESHOLD = 5;   // 連續錯誤達此次數 → 鎖定
const VERIFY_LOCK_MS = 15 * 60_000; // 鎖定時長 15 分鐘

async function countSince(email: string | null, ip: string | null, sinceMs: number) {
  const since = new Date(Date.now() - sinceMs);
  const conds = [gte(t.loginAttempts.createdAt, since)];
  if (email) conds.push(eq(t.loginAttempts.email, email));
  if (ip) conds.push(eq(t.loginAttempts.ip, ip));
  const [row] = await db.select({ c: count() }).from(t.loginAttempts).where(and(...conds));
  return row?.c ?? 0;
}

/** 發驗證碼前檢查:回傳 null 代表可放行,否則回傳給使用者看的錯誤訊息。 */
export async function checkIssueCodeLimit(email: string, ip: string): Promise<string | null> {
  const [emailShort, emailLong, ipCount] = await Promise.all([
    countSince(email, null, WINDOWS.emailShort.ms),
    countSince(email, null, WINDOWS.emailLong.ms),
    countSince(null, ip, WINDOWS.ipLong.ms),
  ]);
  if (emailShort >= WINDOWS.emailShort.max) return "請求過於頻繁,請稍候 1 分鐘後再試。";
  if (emailLong >= WINDOWS.emailLong.max) {
    await logSecurityEvent("login.rate_limited", "medium", null, ip, { email, window: "email_10min" });
    return "此信箱短時間內請求驗證碼次數過多,請 10 分鐘後再試。";
  }
  if (ipCount >= WINDOWS.ipLong.max) {
    await logSecurityEvent("login.rate_limited", "high", null, ip, { window: "ip_10min" });
    return "此網路來源請求過於頻繁,請稍後再試。";
  }
  return null;
}

export async function recordIssueCode(email: string, ip: string) {
  await db.insert(t.loginAttempts).values({ email, ip, ok: true });
}

/** 驗證碼比對前檢查是否已被鎖定;回傳鎖定剩餘毫秒數,0 代表未鎖定。 */
export async function checkVerifyLock(email: string): Promise<number> {
  const since = new Date(Date.now() - VERIFY_LOCK_MS);
  const rows = await db.select().from(t.loginAttempts)
    .where(and(eq(t.loginAttempts.email, email), eq(t.loginAttempts.ok, false), gte(t.loginAttempts.createdAt, since)))
    .orderBy(t.loginAttempts.createdAt);
  if (rows.length < VERIFY_LOCK_THRESHOLD) return 0;
  const lockedUntil = rows[rows.length - 1].createdAt.getTime() + VERIFY_LOCK_MS;
  return Math.max(0, lockedUntil - Date.now());
}

/** 記錄一次驗證結果;失敗次數達門檻時記錄安全事件並回傳階梯式延遲毫秒數(拉高暴力破解成本)。 */
export async function recordVerifyAttempt(email: string, ip: string, ok: boolean): Promise<number> {
  await db.insert(t.loginAttempts).values({ email, ip, ok });
  if (ok) return 0;
  const since = new Date(Date.now() - VERIFY_LOCK_MS);
  const [row] = await db.select({ c: count() }).from(t.loginAttempts)
    .where(and(eq(t.loginAttempts.email, email), eq(t.loginAttempts.ok, false), gte(t.loginAttempts.createdAt, since)));
  const failCount = row?.c ?? 0;
  if (failCount >= VERIFY_LOCK_THRESHOLD) {
    await logSecurityEvent("login.locked", "high", null, ip, { email, failCount });
  }
  // 第 3 次錯誤起,每次多延遲 1 秒(上限 4 秒),减缓自動化暴力嘗試。
  return failCount >= 3 ? Math.min((failCount - 2) * 1000, 4000) : 0;
}
