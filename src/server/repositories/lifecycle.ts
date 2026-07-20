// 帳號生命週期自動化(架構書「帳號生命週期」章節)
// ─────────────────────────────────────────────────────────────
// 誠實的範圍界定:
// - 「偵測離校」在正式環境應接教務處學籍 API 或政大信箱退信偵測(政大信箱畢業後
//   保留約半年才轉校友信箱)。這裡沒有真實信箱系統可接,偵測改為管理員手動觸發
//   (markGraduationDetected),但「進入緩衝期 → 緩衝期到期自動轉為校友」這條轉換
//   邏輯本身是真實運作的,不是裝飾。
// - 「批次到期處理」在正式環境應由排程器(cron/Vercel Cron/GitHub Actions 排程)
//   定期呼叫 processLifecycleTransitions();這裡沒有排程基礎設施,改為管理員在
//   /admin/lifecycle 頁面手動按鈕觸發「執行今日批次」,函式本身的邏輯是真實的,
//   只是觸發方式在此環境下是手動而非自動定時。
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { and, eq, lte, ne } from "drizzle-orm";
import { notify } from "./notifications";
import { audit } from "./audit";

const GRADUATION_BUFFER_MS = 180 * 24 * 3600_000; // 6 個月緩衝期
const MIN_RELINQUISH_DAYS = 30;
const MAX_RELINQUISH_DAYS = 90;

// ── 校友轉換(畢業偵測 → 緩衝期 → 自動降級)───────────────────

export async function markGraduationDetected(userId: string, triggeredByAdminId: string) {
  const bufferEndsAt = new Date(Date.now() + GRADUATION_BUFFER_MS);
  await db.update(t.users).set({
    lifecycleBufferEndsAt: bufferEndsAt,
    lifecycleNote: "偵測到可能已離校,進入畢業緩衝期",
  }).where(eq(t.users.id, userId));
  await audit(triggeredByAdminId, "lifecycle.graduation_detected", "USER", userId, { bufferEndsAt });
  await notify(userId, "lifecycle.graduation_buffer", "系統偵測到你可能已離校",
    `緩衝期至 ${bufferEndsAt.toLocaleDateString("zh-TW")},期間權限不受影響,到期後帳號將轉為校友唯讀狀態。`, "/");
}

/** 取消先前誤判的緩衝期(例如使用者其實還在學)。 */
export async function cancelGraduationBuffer(userId: string, adminId: string) {
  await db.update(t.users).set({ lifecycleBufferEndsAt: null, lifecycleNote: "" }).where(eq(t.users.id, userId));
  await audit(adminId, "lifecycle.graduation_buffer_cancelled", "USER", userId);
}

export async function listUsersInBuffer() {
  const { isNotNull } = await import("drizzle-orm");
  return db.select().from(t.users).where(and(isNotNull(t.users.lifecycleBufferEndsAt), eq(t.users.status, "ACTIVE")));
}

/** 批次處理:緩衝期已到期的帳號自動轉為 ALUM(唯讀)。回傳實際被轉換的帳號數。 */
export async function processLifecycleTransitions(): Promise<{ toAlum: number; relinquishmentsClosed: number }> {
  const now = new Date();
  const { isNotNull } = await import("drizzle-orm");
  const dueUsers = await db.select().from(t.users).where(and(
    isNotNull(t.users.lifecycleBufferEndsAt),
    lte(t.users.lifecycleBufferEndsAt, now),
    eq(t.users.status, "ACTIVE"),
  ));
  for (const u of dueUsers) {
    await db.update(t.users).set({ status: "ALUM", lifecycleNote: "緩衝期已到期,自動轉為校友(唯讀)" }).where(eq(t.users.id, u.id));
    await audit(null, "lifecycle.auto_transition_to_alum", "USER", u.id);
    await notify(u.id, "lifecycle.became_alum", "你的帳號已轉為校友狀態",
      "畢業緩衝期已結束,帳號轉為唯讀,可查看歷史紀錄但無法再發起新的媒合。", "/");
  }

  const relinquishClosed = await processRelinquishments();
  return { toAlum: dueUsers.length, relinquishmentsClosed: relinquishClosed };
}

// ── 休學/復學/退學 ────────────────────────────────────────

export async function suspendAccount(userId: string, adminId: string, reason: string) {
  await db.update(t.users).set({ status: "SUSPENDED", lifecycleNote: reason }).where(eq(t.users.id, userId));
  await audit(adminId, "lifecycle.suspend", "USER", userId, { reason });
  await notify(userId, "lifecycle.suspended", "你的帳號已暫停(休學)", "復學後可申請恢復,期間資料完整保留。", "/");
}

export async function restoreAccount(userId: string, adminId: string) {
  const [user] = await db.select().from(t.users).where(eq(t.users.id, userId));
  if (user?.status !== "SUSPENDED") throw new Error("只有暫停中的帳號可以復學");
  await db.update(t.users).set({ status: "ACTIVE", lifecycleNote: "" }).where(eq(t.users.id, userId));
  await audit(adminId, "lifecycle.restore", "USER", userId);
  await notify(userId, "lifecycle.restored", "你的帳號已恢復為正常狀態", "", "/");
}

export async function archiveAccount(userId: string, adminId: string, reason: string) {
  await db.update(t.users).set({ status: "ARCHIVED", lifecycleNote: reason }).where(eq(t.users.id, userId));
  await audit(adminId, "lifecycle.archive", "USER", userId, { reason });
  await notify(userId, "lifecycle.archived", "你的帳號已轉為封存狀態", "資料完整保留,但無法再進行任何操作。", "/");
}

// ── 教授帳號交接(放棄帳號需 30–90 天前申請,通知利益相關人)──────────

export async function initiateRelinquishment(professorId: string, initiatedById: string, daysFromNow: number, reason: string) {
  if (daysFromNow < MIN_RELINQUISH_DAYS || daysFromNow > MAX_RELINQUISH_DAYS) {
    throw new Error(`交接天數須介於 ${MIN_RELINQUISH_DAYS}–${MAX_RELINQUISH_DAYS} 天`);
  }
  const relinquishAt = new Date(Date.now() + daysFromNow * 86400_000);
  const [row] = await db.insert(t.professorRelinquishments).values({
    professorId, initiatedById, reason, relinquishAt,
  }).returning();
  await audit(initiatedById, "lifecycle.relinquishment_initiated", "PROFESSOR", professorId, { relinquishAt });

  // 通知利益相關人:此教授所有開放需求底下,尚未結案(非 accepted/rejected)的申請人
  const postings = await db.select().from(t.postings).where(and(eq(t.postings.professorId, professorId), eq(t.postings.isOpen, true)));
  for (const p of postings) {
    const apps = await db.select().from(t.applications).where(
      and(eq(t.applications.postingId, p.id), ne(t.applications.status, "rejected")),
    );
    for (const app of apps) {
      await notify(app.applicantId, "lifecycle.relinquishment_notice", "你關注的需求即將關閉",
        `「${p.title}」的教授已申請帳號交接,將於 ${relinquishAt.toLocaleDateString("zh-TW")} 生效。`, `/postings/${p.id}`);
    }
  }
  return row;
}

export async function cancelRelinquishment(id: string, adminId: string) {
  await db.update(t.professorRelinquishments).set({ status: "cancelled" }).where(eq(t.professorRelinquishments.id, id));
  await audit(adminId, "lifecycle.relinquishment_cancelled", "PROFESSOR_RELINQUISHMENT", id);
}

export async function listPendingRelinquishments() {
  return db.select().from(t.professorRelinquishments).where(eq(t.professorRelinquishments.status, "pending"));
}

/** 批次處理:交接日已到的申請,自動關閉該教授所有開放需求(凍結封存,不刪除任何資料)。 */
async function processRelinquishments(): Promise<number> {
  const now = new Date();
  const due = await db.select().from(t.professorRelinquishments)
    .where(and(eq(t.professorRelinquishments.status, "pending"), lte(t.professorRelinquishments.relinquishAt, now)));
  for (const r of due) {
    await db.update(t.postings).set({ isOpen: false, closedReason: "professor_relinquished" })
      .where(and(eq(t.postings.professorId, r.professorId), eq(t.postings.isOpen, true)));
    await db.update(t.professorRelinquishments).set({ status: "completed" }).where(eq(t.professorRelinquishments.id, r.id));
    await audit(null, "lifecycle.relinquishment_completed", "PROFESSOR", r.professorId);
  }
  return due.length;
}

// ── 帳號血緣 ──────────────────────────────────────────────

export async function createAccountLineage(fromAccountId: string, toAccountId: string, linkType: string, adminId: string) {
  const [row] = await db.insert(t.accountLineage).values({ fromAccountId, toAccountId, linkType }).returning();
  await audit(adminId, "lifecycle.lineage_created", "USER", toAccountId, { fromAccountId, linkType });
  return row;
}

export async function getLineageFor(accountId: string) {
  const asFrom = await db.select().from(t.accountLineage).where(eq(t.accountLineage.fromAccountId, accountId));
  const asTo = await db.select().from(t.accountLineage).where(eq(t.accountLineage.toAccountId, accountId));
  return { successors: asFrom, predecessors: asTo }; // 這帳號後來變成了誰 / 這帳號的前身是誰
}
