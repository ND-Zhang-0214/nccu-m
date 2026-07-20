// 安全事件記錄與告警(§8)
// ─────────────────────────────────────────────────────────────
// 與 audit.ts 的一般業務稽核不同:這裡只記錄「異常/可疑」事件,供管理員審視與即時告警。
// 規則:detail 欄位只放結構化中繼資料,絕不寫入密碼、驗證碼、訊息內文等明文機敏內容。
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { desc, eq, gte, and } from "drizzle-orm";

export type Severity = "low" | "medium" | "high";

export async function logSecurityEvent(
  type: string, severity: Severity, actorId: string | null, ip: string,
  detail: Record<string, unknown> = {},
) {
  await db.insert(t.securityEvents).values({
    type, severity, actorId: actorId ?? undefined, ip, detail: JSON.stringify(detail),
  });

  // §8 告警門檻:高嚴重度事件即時通知管理員(站內通知,初期不需複雜 SIEM)。
  if (severity === "high") {
    const admins = await db.select().from(t.users).where(eq(t.users.role, "ADMIN"));
    const { notify } = await import("./notifications");
    for (const admin of admins) {
      await notify(admin.id, "security.alert", `安全事件:${type}`,
        `嚴重度 high,發生時間 ${new Date().toLocaleString("zh-TW")}`, "/admin/security");
    }
  }
}

export async function listRecentSecurityEvents(limit = 100) {
  return db.select().from(t.securityEvents).orderBy(desc(t.securityEvents.createdAt)).limit(limit);
}

export async function countRecentByType(type: string, sinceMs: number) {
  const rows = await db.select().from(t.securityEvents)
    .where(and(eq(t.securityEvents.type, type), gte(t.securityEvents.createdAt, new Date(Date.now() - sinceMs))));
  return rows.length;
}
