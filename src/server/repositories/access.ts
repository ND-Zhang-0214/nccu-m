// 應用層列舉偵測(§3.3)
// ─────────────────────────────────────────────────────────────
// 核心洞見:2026 年的爬蟲會用住宅代理 IP + 真實無頭瀏覽器繞過網路層防禦(IP 限流/UA 過濾),
// 但無法隱藏「短時間內循序看過大量不同教授檔案」這種行為模式。因此偵測放在應用層,
// 看「存取了什麼、多快」,而不是看網路層特徵。
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { and, eq, gte, count, countDistinct } from "drizzle-orm";
import { logSecurityEvent } from "./security";

const SOFT_WINDOW_MS = 10 * 60_000; // 10 分鐘
const SOFT_THRESHOLD = 40;          // 10 分鐘內瀏覽超過 40 個「不同」教授 → 軟門檻
const HARD_THRESHOLD = 80;          // 超過 80 個 → 硬門檻,需人機驗證

export type RiskLevel = "none" | "soft" | "hard";

/** 記錄一次資源存取,並回傳目前的風險等級供呼叫端(頁面/middleware)決定要不要加延遲或要求人機驗證。 */
export async function recordAccessAndAssess(
  actorKey: string, resourceType: "PROFESSOR" | "POSTING" | "SUBFIELD", resourceId: string,
): Promise<RiskLevel> {
  await db.insert(t.accessEvents).values({ actorKey, resourceType, resourceId });

  const since = new Date(Date.now() - SOFT_WINDOW_MS);
  const [row] = await db.select({ c: countDistinct(t.accessEvents.resourceId) }).from(t.accessEvents)
    .where(and(
      eq(t.accessEvents.actorKey, actorKey),
      eq(t.accessEvents.resourceType, resourceType),
      gte(t.accessEvents.createdAt, since),
    ));
  const distinctCount = row?.c ?? 0;

  if (distinctCount >= HARD_THRESHOLD) {
    await logSecurityEvent("enum.detected", "high", null, "", { actorKey, resourceType, distinctCount });
    return "hard";
  }
  if (distinctCount >= SOFT_THRESHOLD) {
    await logSecurityEvent("enum.detected", "medium", null, "", { actorKey, resourceType, distinctCount });
    return "soft";
  }
  return "none";
}

/** actorKey:已登入用 userId;未登入訪客用「無法個人化但仍可歸戶」的匿名鍵(session cookie 值的雜湊)。 */
export function anonymousActorKey(anonId: string) {
  return `anon:${anonId}`;
}
