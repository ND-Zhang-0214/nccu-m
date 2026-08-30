import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { and, eq, gte, count, isNotNull } from "drizzle-orm";
import { randomBytes, createHash } from "node:crypto";
import { GROUP_FILE_TOTAL_QUOTA } from "@/server/storage";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const UPLOAD_HOURLY_LIMIT = 20; // 高壓力/濫用防護:同帳號每小時至多 20 次上傳
const DOWNLOAD_LINK_VALID_MS = 5 * 60_000; // §6:時效簽名連結,5 分鐘有效

export async function countRecentUploads(ownerId: string): Promise<number> {
  const since = new Date(Date.now() - 3600_000);
  const [row] = await db.select({ c: count() }).from(t.attachments)
    .where(and(eq(t.attachments.ownerId, ownerId), gte(t.attachments.createdAt, since)));
  return row?.c ?? 0;
}

/** 僅供上傳前的初步提示用(UI 可即早回饋),**不是實際的配額保證**——
 *  真正的配額保證發生在 createAttachmentIfUnderQuota() 的原子交易裡。 */
export async function isUploadRateLimited(ownerId: string): Promise<boolean> {
  return (await countRecentUploads(ownerId)) >= UPLOAD_HOURLY_LIMIT;
}

/**
 * §6 + 負載測試修正:「檢查配額」與「寫入紀錄」包在同一個 SQLite 交易裡,
 * 兩者之間沒有 await 空隙,高併發下不會被繞過。better-sqlite3 為同步驅動,
 * 交易本體全程同步執行、不會被其他並發請求插入執行,因此天然具備原子性。
 *
 * 已知限制(正式環境換 PostgreSQL 且多台伺服器水平擴展時需注意):此交易的原子性
 * 僅保證「單一資料庫連線內」,換成連線池/多實例部署後,需改用資料庫層級鎖
 * (如 PostgreSQL 的 SELECT ... FOR UPDATE 或 advisory lock)才能維持同樣保證,
 * 不能假設這裡的寫法直接搬過去就一樣安全。
 */
export function createAttachmentIfUnderQuota(input: {
  ownerId: string; applicationId: string | null; groupId?: string | null; originalName: string;
  storedFilename: string; mimeType: string; sizeBytes: number; scanStatus: "clean" | "infected" | "error";
  expiresAt?: Date | null;
}): { ok: true; id: string } | { ok: false; reason: "rate_limited" | "group_quota_exceeded" } {
  // 注意:db.session.client 是 drizzle-orm 的內部實作細節,非公開 API,未來升級 drizzle
  // 版本時務必重新確認此路徑仍然有效(已於 0.45.2 驗證過)。之所以繞過 Drizzle 查詢建構器
  // 直接用原生 better-sqlite3 API,是因為需要在同一個「同步、不會被事件循環插隊」的交易
  // 區塊內完成「查配額+寫入」,這是消除高併發競態條件的必要手段,不是隨意繞過抽象層。
  const sqlite = (db as unknown as { session: { client: import("better-sqlite3").Database } }).session.client;
  const groupId = input.groupId ?? null;
  const tx = sqlite.transaction(() => {
    const since = Math.floor((Date.now() - 3600_000) / 1000);
    const row = sqlite.prepare(
      "SELECT COUNT(*) as c FROM attachments WHERE owner_id = ? AND created_at >= ?",
    ).get(input.ownerId, since) as { c: number };
    if (row.c >= UPLOAD_HOURLY_LIMIT) return { ok: false as const, reason: "rate_limited" as const };

    // 白皮書 2.7.2:群組檔案總量上限 100MB。與上面的頻率檢查同一個同步交易內完成,
    // 理由同檔頭註解——避免高併發下兩個請求都讀到「還沒超過配額」而一起通過。
    if (groupId) {
      const sizeRow = sqlite.prepare(
        "SELECT COALESCE(SUM(size_bytes), 0) as s FROM attachments WHERE group_id = ?",
      ).get(groupId) as { s: number };
      if (sizeRow.s + input.sizeBytes > GROUP_FILE_TOTAL_QUOTA) {
        return { ok: false as const, reason: "group_quota_exceeded" as const };
      }
    }

    const id = crypto.randomUUID();
    sqlite.prepare(
      `INSERT INTO attachments (id, owner_id, application_id, group_id, original_name, stored_filename, mime_type, size_bytes, scan_status, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`,
    ).run(
      id, input.ownerId, input.applicationId, groupId, input.originalName, input.storedFilename,
      input.mimeType, input.sizeBytes, input.scanStatus,
      input.expiresAt ? Math.floor(input.expiresAt.getTime() / 1000) : null,
    );
    return { ok: true as const, id };
  });
  return tx();
}

export async function getAttachment(id: string) {
  const [row] = await db.select().from(t.attachments).where(eq(t.attachments.id, id));
  return row ?? null;
}

export async function listAttachmentsForApplication(applicationId: string) {
  return db.select().from(t.attachments).where(eq(t.attachments.applicationId, applicationId));
}

// ── 白皮書 2.7.2 群組共用檔案區 ──────────────────────────────────────

/** 群組檔案清單,附上傳者顯示名稱(白皮書明文要求「顯示上傳者與時間」)。 */
export async function listAttachmentsForGroup(groupId: string) {
  const rows = await db.select().from(t.attachments)
    .where(eq(t.attachments.groupId, groupId)).orderBy(t.attachments.createdAt);
  const owners = await Promise.all(rows.map((r) => db.select().from(t.users).where(eq(t.users.id, r.ownerId))));
  return rows.map((r, i) => ({ ...r, uploader: owners[i][0] ?? null }));
}

/** 群組目前已用容量(bytes)。UI 顯示配額用;實際配額保證仍在 createAttachmentIfUnderQuota 的原子交易裡。 */
export async function sumGroupFileBytes(groupId: string): Promise<number> {
  const rows = await db.select({ sizeBytes: t.attachments.sizeBytes }).from(t.attachments)
    .where(eq(t.attachments.groupId, groupId));
  return rows.reduce((sum, r) => sum + r.sizeBytes, 0);
}

/** 硬刪除單一附件紀錄(呼叫端另需自行呼叫 storage.ts 的 deleteFile 清掉實體檔案)。 */
export async function deleteAttachment(id: string) {
  await db.delete(t.attachments).where(eq(t.attachments.id, id));
}

/** 供 lifecycle.ts 批次掃描:所有「有設到期時間」的群組檔案(目前僅群組檔案會設 expiresAt)。 */
export async function listAttachmentsWithExpiry() {
  return db.select().from(t.attachments).where(isNotNull(t.attachments.expiresAt));
}

export async function createDownloadToken(attachmentId: string): Promise<string> {
  const token = randomBytes(24).toString("hex");
  await db.insert(t.fileDownloadTokens).values({
    attachmentId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + DOWNLOAD_LINK_VALID_MS),
  });
  return token;
}

export async function resolveDownloadToken(token: string) {
  const [row] = await db.select().from(t.fileDownloadTokens)
    .where(and(eq(t.fileDownloadTokens.tokenHash, sha256(token)), gte(t.fileDownloadTokens.expiresAt, new Date())));
  if (!row) return null;
  return getAttachment(row.attachmentId);
}
