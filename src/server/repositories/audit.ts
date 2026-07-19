import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { desc, eq } from "drizzle-orm";

export async function audit(actorId: string | null, action: string, targetType = "", targetId = "", meta: Record<string, unknown> = {}) {
  await db.insert(t.auditLogs).values({ actorId, action, targetType, targetId, meta: JSON.stringify(meta) });
}

export async function createReport(reporterId: string, targetType: string, targetId: string, reason: string) {
  await db.insert(t.reports).values({ reporterId, targetType, targetId, reason });
}

export async function listOpenReports() {
  return db.select().from(t.reports).where(eq(t.reports.status, "open")).orderBy(desc(t.reports.createdAt));
}

export async function resolveReport(id: string, status: "resolved" | "dismissed", outcome: string) {
  await db.update(t.reports).set({ status, outcome }).where(eq(t.reports.id, id));
}
