import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { desc, eq, asc } from "drizzle-orm";
import { chainHash } from "@/server/crypto";

// §5.2 存證完整性:每筆稽核紀錄的 hash = sha256(前一筆 hash + 本筆內容)。
// 任何人事後竄改或刪除中間一筆,後續所有 hash 都會對不上,竄改因此必定可被偵測。
export async function audit(actorId: string | null, action: string, targetType = "", targetId = "", meta: Record<string, unknown> = {}) {
  const [last] = await db.select({ hash: t.auditLogs.hash }).from(t.auditLogs).orderBy(desc(t.auditLogs.createdAt)).limit(1);
  const prevHash = last?.hash || "";
  const content = { actorId, action, targetType, targetId, meta };
  const hash = chainHash(prevHash, content);
  await db.insert(t.auditLogs).values({ actorId, action, targetType, targetId, meta: JSON.stringify(meta), prevHash, hash });
}

/** 驗證整條稽核鏈是否完整;回傳 null 代表完整,否則回傳第一筆斷鏈紀錄的 id。 */
export async function verifyAuditChain(): Promise<string | null> {
  const rows = await db.select().from(t.auditLogs).orderBy(asc(t.auditLogs.createdAt));
  let prevHash = "";
  for (const row of rows) {
    const expected = chainHash(prevHash, {
      actorId: row.actorId, action: row.action, targetType: row.targetType,
      targetId: row.targetId, meta: JSON.parse(row.meta),
    });
    if (row.hash !== expected) return row.id;
    prevHash = row.hash;
  }
  return null;
}

export async function createReport(reporterId: string, targetType: string, targetId: string, reason: string) {
  await db.insert(t.reports).values({ reporterId, targetType, targetId, reason });
}

export async function listOpenReports() {
  return db.select().from(t.reports).where(eq(t.reports.status, "open")).orderBy(desc(t.reports.createdAt));
}

export async function resolveReport(id: string, status: "resolved" | "dismissed", outcome: string) {
  await db.update(t.reports).set({ status, outcome, resolvedAt: new Date() }).where(eq(t.reports.id, id));
}

export async function getReport(id: string) {
  const [row] = await db.select().from(t.reports).where(eq(t.reports.id, id));
  return row ?? null;
}

// 「我的檢舉」進度追蹤用
export async function listReportsByUser(reporterId: string) {
  return db.select().from(t.reports)
    .where(eq(t.reports.reporterId, reporterId))
    .orderBy(desc(t.reports.createdAt));
}
