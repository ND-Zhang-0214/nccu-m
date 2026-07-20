// 學期聚合統計報告(架構書:僅彙整數字,不含個資,分組樣本 <5 不呈現)
// ─────────────────────────────────────────────────────────────
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { and, gte, lte, count, sql, type Column } from "drizzle-orm";

const SUPPRESS_BELOW = 5; // §紅線:任何分組樣本數 <5 不呈現實際數字

function suppress(n: number): number | "＜5(依規則隱藏)" {
  return n < SUPPRESS_BELOW ? "＜5(依規則隱藏)" : n;
}

export async function computeSemesterStats(start: Date, end: Date) {
  const inRange = (col: Column) => and(gte(col, start), lte(col, end));

  const [newUsers] = await db.select({ c: count() }).from(t.users).where(inRange(t.users.createdAt));

  const postingsByCategory = await db.select({
    category: t.postings.category, c: count(),
  }).from(t.postings).where(inRange(t.postings.createdAt)).groupBy(t.postings.category);

  const [totalApplications] = await db.select({ c: count() }).from(t.applications).where(inRange(t.applications.createdAt));
  const applicationsByStatus = await db.select({
    status: t.applications.status, c: count(),
  }).from(t.applications).where(inRange(t.applications.createdAt)).groupBy(t.applications.status);

  const acceptedCount = applicationsByStatus.find((r) => r.status === "accepted")?.c ?? 0;
  const matchSuccessRate = totalApplications.c > 0 ? Math.round((acceptedCount / totalApplications.c) * 1000) / 10 : 0;

  const [totalReports] = await db.select({ c: count() }).from(t.reports).where(inRange(t.reports.createdAt));
  const reportsByStatus = await db.select({
    status: t.reports.status, c: count(),
  }).from(t.reports).where(inRange(t.reports.createdAt)).groupBy(t.reports.status);

  // 平均處理時效(小時):僅計算已結案的檢舉
  const [avgResolutionRow] = await db.select({
    avgHours: sql<number>`avg((resolved_at - created_at)) / 3600.0`,
  }).from(t.reports).where(and(inRange(t.reports.createdAt), sql`resolved_at IS NOT NULL`));

  const lifecycleEvents = await db.select({
    action: t.auditLogs.action, c: count(),
  }).from(t.auditLogs)
    .where(and(
      gte(t.auditLogs.createdAt, start), lte(t.auditLogs.createdAt, end),
      sql`action LIKE 'lifecycle.%'`,
    ))
    .groupBy(t.auditLogs.action);

  return {
    period: { start, end },
    newUsers: suppress(newUsers.c),
    postingsByCategory: postingsByCategory.map((r) => ({ category: r.category, count: suppress(r.c) })),
    totalApplications: suppress(totalApplications.c),
    applicationsByStatus: applicationsByStatus.map((r) => ({ status: r.status, count: suppress(r.c) })),
    matchSuccessRate: totalApplications.c >= SUPPRESS_BELOW ? `${matchSuccessRate}%` : "樣本不足,不呈現",
    totalReports: suppress(totalReports.c),
    reportsByStatus: reportsByStatus.map((r) => ({ status: r.status, count: suppress(r.c) })),
    avgResolutionHours: totalReports.c >= SUPPRESS_BELOW && avgResolutionRow?.avgHours != null
      ? Math.round(avgResolutionRow.avgHours * 10) / 10 : "樣本不足或無已結案案件,不呈現",
    lifecycleEvents: lifecycleEvents.map((r) => ({ action: r.action, count: suppress(r.c) })),
  };
}
