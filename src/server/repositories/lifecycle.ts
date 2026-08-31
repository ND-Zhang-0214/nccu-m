// 帳號生命週期自動化(架構書「帳號生命週期」章節)
// ─────────────────────────────────────────────────────────────
// 誠實的範圍界定:
// - 「偵測離校」在正式環境應接教務處學籍 API 或政大信箱退信偵測(政大信箱畢業後
//   保留約半年才轉校友信箱)。這裡沒有真實信箱系統可接,偵測改為管理員手動觸發
//   (markGraduationDetected),但「進入緩衝期 → 緩衝期到期自動轉為校友」這條轉換
//   邏輯本身是真實運作的,不是裝飾。
// - 「批次到期處理」原本沒有排程基礎設施,只能在 /admin/lifecycle 頁面手動按鈕觸發。
//   現已改接 src/server/scheduler.ts 的 node-cron 定時排程(預設每日凌晨 3 點自動執行,
//   可用 LIFECYCLE_CRON_SCHEDULE 環境變數調整頻率,詳見該檔案的說明),/admin/lifecycle
//   的按鈕保留作為「立即手動觸發一次」的補充功能(例如展示,或需要立刻套用某筆變更、
//   不想等到下個排定時間時使用),兩者呼叫的都是這裡的 processLifecycleTransitions(),
//   轉換邏輯完全一致,差別只在觸發來源——稽核紀錄的 actorId 會標示是排程觸發(null)
//   還是哪一位管理員手動觸發。
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
  // 白皮書 2.13:原文的畢業前 90/60/30/7 天倒數提醒需要「預計畢業年月」欄位,本系統沒有
  // 這個資料來源(詳見 data-export.ts 檔頭)。改在這個既有、真實會發生的轉換點提前提醒——
  // 緩衝期通常長達 6 個月,足夠讓使用者從容匯出資料。
  await notify(userId, "lifecycle.graduation_buffer", "系統偵測到你可能已離校",
    `緩衝期至 ${bufferEndsAt.toLocaleDateString("zh-TW")},期間權限不受影響,到期後帳號將轉為校友唯讀狀態。建議提早於「個人設定」匯出你的完整資料備份。`, "/me/settings");
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
export async function processLifecycleTransitions(): Promise<{
  toAlum: number; relinquishmentsClosed: number; collabPostingsExpired: number;
  groupFilesExpired: number; groupFilesReminded: number;
}> {
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

    // 白皮書 2.13:「轉為 ALUM 後,產生封存檔,寄送僅含一次性下載連結的信件,連結 30 天到期」。
    // 一次性連結本身即為存取憑證(見 data-export.ts 檔頭簡化說明)。EMAIL 提醒 2026-08 起
    // 接上 email.ts 的 Resend 寄信服務(未設定 RESEND_API_KEY 時 sendEmail 直接回傳
    // { sent: false},不影響批次繼續執行)。站內通知(平台提醒)則是真的會出現在使用者
    // 通知列表,不論信件是否寄出都會有。
    const { issueExportToken } = await import("./data-export");
    const { sendEmail, appBaseUrl } = await import("@/server/email");
    const exportToken = await issueExportToken(u.id);
    await notify(u.id, "data_export.available", "你的一次性資料匯出連結已產生",
      "帳號已轉為校友,系統已為你產生一次性資料匯出連結(30 天內有效,使用一次後即失效)。點此立即下載完整資料備份。",
      `/api/export/${exportToken}`);
    const { sent } = await sendEmail(
      u.email, "【政大研究媒合平台】你的帳號已轉為校友,資料匯出連結已產生",
      `帳號已轉為校友(唯讀)狀態。系統已為你產生一次性資料匯出連結,30 天內有效,使用一次後即失效:\n${appBaseUrl()}/api/export/${exportToken}`,
    );
    await audit(null, "data_export.graduation_email", "USER", u.id, { to: u.email, sent });
  }

  const relinquishClosed = await processRelinquishments();
  const collabExpired = await closeExpiredCollabPostings();
  const groupFiles = await expireAndRemindGroupFiles();
  return {
    toAlum: dueUsers.length, relinquishmentsClosed: relinquishClosed, collabPostingsExpired: collabExpired,
    groupFilesExpired: groupFiles.expired, groupFilesReminded: groupFiles.reminded,
  };
}

/** 白皮書 2.7.2:群組共用檔案「單檔僅保留一個月,到期前一週提醒(平台提醒+EMAIL提醒)」。
 *  「平台提醒」是真的運作的站內通知;「EMAIL 提醒」2026-08 起接上 email.ts 的 Resend
 *  寄信服務(未設定 RESEND_API_KEY 時 sendEmail 直接回傳 { sent: false},不影響批次
 *  繼續執行,audit 紀錄裡的 sent 欄位如實反映有沒有真的寄出)。
 *  排程本身由任務 #17(node-cron/Vercel Cron)接上,這裡先確保「到期就真的會刪除/提醒」
 *  這條邏輯是可運作的,觸發時機則是排程或 /admin/lifecycle 手動觸發。 */
async function expireAndRemindGroupFiles(): Promise<{ expired: number; reminded: number }> {
  const { listAttachmentsWithExpiry, deleteAttachment } = await import("./attachments");
  const { listGroupMembers } = await import("./groups");
  const { deleteFile } = await import("@/server/storage");
  const { GROUP_FILE_REMINDER_BEFORE_MS } = await import("@/server/storage");

  const now = Date.now();
  const rows = await listAttachmentsWithExpiry(); // 目前僅群組檔案會設 expiresAt
  let expired = 0, reminded = 0;

  for (const att of rows) {
    if (!att.groupId || !att.expiresAt) continue;
    const expiresAtMs = att.expiresAt.getTime();

    if (expiresAtMs <= now) {
      await deleteFile(att.storedFilename);
      await deleteAttachment(att.id);
      await audit(null, "group_file.auto_expired", "ATTACHMENT", att.id, { groupId: att.groupId, originalName: att.originalName });
      const members = await listGroupMembers(att.groupId);
      for (const m of members) {
        await notify(m.userId, "group_file.expired", "群組檔案已到期並自動刪除",
          `「${att.originalName}」已超過一個月保存期限,已自動刪除且無法復原。`, `/groups/${att.groupId}`);
      }
      expired++;
    } else if (expiresAtMs - now <= GROUP_FILE_REMINDER_BEFORE_MS && !att.expiryRemindedAt) {
      await db.update(t.attachments).set({ expiryRemindedAt: new Date() }).where(eq(t.attachments.id, att.id));
      const members = await listGroupMembers(att.groupId);
      const expiresAtLabel = att.expiresAt.toLocaleDateString("zh-TW");
      const { sendEmail, appBaseUrl } = await import("@/server/email");
      for (const m of members) {
        await notify(m.userId, "group_file.expiring_soon", "群組檔案即將到期",
          `「${att.originalName}」將於 ${expiresAtLabel} 到期並自動刪除,如需保留請自行下載備份。`, `/groups/${att.groupId}`);
        const to = m.user?.email ?? "";
        const { sent } = await sendEmail(
          to, `【政大研究媒合平台】群組檔案「${att.originalName}」即將到期`,
          `「${att.originalName}」將於 ${expiresAtLabel} 到期並自動刪除,如需保留請自行下載備份:\n${appBaseUrl()}/groups/${att.groupId}`,
        );
        await audit(null, "group_file.expiry_email", "ATTACHMENT", att.id, { to, groupId: att.groupId, sent });
      }
      reminded++;
    }
  }
  return { expired, reminded };
}

/** 白皮書 2.6.2:學生合作專區「時程與截止日」到期自動關閉——deadline 存在
 *  postings.structuredFields.deadline(YYYY-MM-DD),到期即自動關閉,不算使用者主動
 *  關閉,故 closedReason 標記為 deadline_expired 以便事後區分。只掃描 posterType=
 *  STUDENT 的需求;沒有 deadline 欄位的(如碩博生自行發布需求)直接略過,不受影響。
 *  比照本檔其餘批次函式的既有取捨:排程本身留待任務 #17(node-cron)接上,這裡先確保
 *  「到期就真的會關閉」這條邏輯是可運作的,只是觸發時機目前仍是手動或本函式的呼叫端。 */
async function closeExpiredCollabPostings(): Promise<number> {
  const now = Date.now();
  const open = await db.select().from(t.postings)
    .where(and(eq(t.postings.isOpen, true), eq(t.postings.posterType, "STUDENT")));
  let count = 0;
  for (const p of open) {
    let deadline: unknown;
    try { deadline = JSON.parse(p.structuredFields || "{}").deadline; } catch { continue; }
    if (typeof deadline !== "string" || !deadline) continue;
    const deadlineMs = new Date(`${deadline}T23:59:59`).getTime();
    if (Number.isNaN(deadlineMs) || deadlineMs > now) continue;
    await db.update(t.postings).set({ isOpen: false, closedReason: "deadline_expired" }).where(eq(t.postings.id, p.id));
    await audit(null, "posting.auto_closed_deadline", "POSTING", p.id);
    count++;
  }
  return count;
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
