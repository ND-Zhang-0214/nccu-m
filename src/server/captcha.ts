// 條件式人機驗證(§3.4)
// ─────────────────────────────────────────────────────────────
// 設計原則:預設不出現,只在 §3.3 判定為高風險行為模式時才觸發,避免全站強制驗證碼
// 傷害正常使用體驗與無障礙。方案選擇避免把使用者資料送給第三方廣告生態系。
//
// 正式環境替換點:設定 TURNSTILE_SECRET_KEY 後,verifyChallenge() 會改呼叫
// Cloudflare Turnstile 驗證 API;未設定時退回本機簡易挑戰(僅供開發/尚未申請
// Turnstile 金鑰前使用,不建議正式環境依賴此路徑)。
import { randomBytes, createHash } from "node:crypto";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { eq, gt, and } from "drizzle-orm";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const CHECK_VALID_MS = 30 * 60_000; // 通過驗證後 30 分鐘內免重複驗證

export function isTurnstileConfigured() {
  return !!process.env.TURNSTILE_SECRET_KEY;
}

/** 正式環境:向 Cloudflare 驗證 Turnstile token。開發環境:退回本機簡易挑戰(見 local-challenge)。 */
export async function verifyTurnstileToken(token: string, remoteIp: string): Promise<boolean> {
  if (!isTurnstileConfigured()) return false; // 未設定金鑰時一律視為未通過(fail-closed)
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!, response: token, remoteip: remoteIp }),
  });
  const data = await res.json();
  return !!data.success;
}

/** 通過驗證後核發一個時效通行證,記錄於 humanChecks(只存雜湊)。 */
export async function grantHumanCheck(actorKey: string): Promise<void> {
  const token = randomBytes(24).toString("hex");
  await db.insert(t.humanChecks).values({
    actorKey, tokenHash: sha256(token), expiresAt: new Date(Date.now() + CHECK_VALID_MS),
  });
}

export async function hasValidHumanCheck(actorKey: string): Promise<boolean> {
  const [row] = await db.select().from(t.humanChecks)
    .where(and(eq(t.humanChecks.actorKey, actorKey), gt(t.humanChecks.expiresAt, new Date())));
  return !!row;
}
