// §2.5 管理員敏感調閱雙人核可
// ─────────────────────────────────────────────────────────────
// 設計:調閱敏感內容(如站內訊息)分兩階段——①管理員 A 提出調閱申請(pending)
// ②另一位管理員 B 核可(approved,且 B 不可等於 A)③A 才能在核可後 30 分鐘的
// 時效窗口內實際查看,逾窗口需重新申請。任何一步都寫入業務稽核(audit()),
// 讓「誰申請、誰核可、誰在什麼時間點實際查看」全程留痕。
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { and, eq, gt, ne, desc } from "drizzle-orm";

const PENDING_WINDOW_MS = 60 * 60_000;   // 待核可申請的有效期限:1 小時內須有人核可,否則視為過期
const ACCESS_WINDOW_MS = 30 * 60_000;    // 核可通過後,實際可查看的時效窗口:30 分鐘

export async function requestApproval(requesterId: string, action: string, targetType: string, targetId: string) {
  const [row] = await db.insert(t.dualApprovals).values({
    requesterId, action, targetType, targetId,
    expiresAt: new Date(Date.now() + PENDING_WINDOW_MS),
  }).returning();
  return row;
}

/** 待其他管理員核可的申請清單,刻意排除「自己申請的」——避免介面上誤導成自己可以自己核可。 */
export async function listPendingForOthers(excludeRequesterId: string) {
  return db.select().from(t.dualApprovals)
    .where(and(
      eq(t.dualApprovals.status, "pending"),
      ne(t.dualApprovals.requesterId, excludeRequesterId),
      gt(t.dualApprovals.expiresAt, new Date()),
    ))
    .orderBy(desc(t.dualApprovals.createdAt));
}

export async function listMyRequests(requesterId: string) {
  return db.select().from(t.dualApprovals)
    .where(eq(t.dualApprovals.requesterId, requesterId))
    .orderBy(desc(t.dualApprovals.createdAt));
}

export async function getApproval(id: string) {
  const [row] = await db.select().from(t.dualApprovals).where(eq(t.dualApprovals.id, id));
  return row ?? null;
}

/** 核可或駁回;明確拒絕「自己核可自己的申請」,這是本機制存在的唯一理由,不能有漏洞。 */
export async function decideApproval(id: string, approverId: string, decision: "approved" | "rejected") {
  const approval = await getApproval(id);
  if (!approval) throw new Error("找不到此申請");
  if (approval.requesterId === approverId) throw new Error("不可核可自己提出的申請");
  if (approval.status !== "pending") throw new Error("此申請已被處理過");
  if (approval.expiresAt.getTime() < Date.now()) throw new Error("此申請已逾時失效");

  await db.update(t.dualApprovals).set({
    status: decision, approverId, approvedAt: decision === "approved" ? new Date() : undefined,
  }).where(eq(t.dualApprovals.id, id));
}

/** 目前是否有一筆「已核可、且仍在 30 分鐘存取時效窗口內」的授權,供實際查看動作前檢查。 */
export async function hasActiveApproval(requesterId: string, action: string, targetType: string, targetId: string): Promise<boolean> {
  const [row] = await db.select().from(t.dualApprovals).where(and(
    eq(t.dualApprovals.requesterId, requesterId),
    eq(t.dualApprovals.action, action),
    eq(t.dualApprovals.targetType, targetType),
    eq(t.dualApprovals.targetId, targetId),
    eq(t.dualApprovals.status, "approved"),
  ));
  if (!row || !row.approvedAt) return false;
  return Date.now() - row.approvedAt.getTime() < ACCESS_WINDOW_MS;
}
