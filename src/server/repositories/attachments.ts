import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { and, eq, gte, count, sum, isNotNull, sql } from "drizzle-orm";
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
 * §6 + 負載測試修正:「檢查配額」與「寫入紀錄」需要包在同一個交易裡,高併發下才不會被繞過。
 *
 * 2026-08 換資料庫紀錄(誠實記錄改寫理由,而非默默替換):原本(SQLite)利用 better-sqlite3
 * 的同步驅動特性——交易本體全程同步執行、Node.js 事件迴圈不會插隊——天然達成原子性,因此
 * 直接繞過 Drizzle 查詢建構器,拿原生連線手刻同步交易。換成 PostgreSQL(尤其是走連線池/
 * PgBouncer 的無伺服器部署)後這個假設不再成立:交易內每一步都是非同步的,不同請求的交易
 * 確實可能交錯執行。改用 PostgreSQL 交易層級的 pg_advisory_xact_lock(session/transaction
 * 範圍的建議鎖):交易一開始就取得「同一個 ownerId」(有 groupId 時,另外再取「同一個
 * groupId」)的鎖,交易結束(COMMIT/ROLLBACK)時自動釋放,不需手動 unlock。刻意把鎖分成
 * owner、group 兩把獨立的鍵,語意對應原本「每帳號每小時上限」「每群組總容量上限」兩個各自
 * 獨立的限制——不同使用者或不同群組的上傳仍可平行處理,只有「同一位使用者」或「同一個
 * 群組」的併發請求會被交易層級序列化。這是刻意更精確的範圍限縮(原 SQLite 版本是整個
 * process 全域序列化,含彼此不相干的使用者),不是「應該等價但沒把握」的猜測性改寫。
 */
export async function createAttachmentIfUnderQuota(input: {
  ownerId: string; applicationId: string | null; groupId?: string | null; originalName: string;
  storedFilename: string; mimeType: string; sizeBytes: number; scanStatus: "clean" | "infected" | "error";
  expiresAt?: Date | null;
}): Promise<{ ok: true; id: string } | { ok: false; reason: "rate_limited" | "group_quota_exceeded" }> {
  const groupId = input.groupId ?? null;

  return db.transaction(async (tx) => {
    // hashtext() 是 PostgreSQL 內建函式,將任意字串轉為 32-bit 整數供 advisory lock 使用。
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"attachments:owner:" + input.ownerId}))`);

    const since = new Date(Date.now() - 3600_000);
    const [rateRow] = await tx.select({ c: count() }).from(t.attachments)
      .where(and(eq(t.attachments.ownerId, input.ownerId), gte(t.attachments.createdAt, since)));
    if ((rateRow?.c ?? 0) >= UPLOAD_HOURLY_LIMIT) {
      return { ok: false as const, reason: "rate_limited" as const };
    }

    // 白皮書 2.7.2:群組檔案總量上限 100MB。與上面的頻率檢查一樣需要在交易內完成,
    // 避免高併發下兩個請求都讀到「還沒超過配額」而一起通過。
    if (groupId) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"attachments:group:" + groupId}))`);
      const [sizeRow] = await tx.select({ s: sum(t.attachments.sizeBytes) }).from(t.attachments)
        .where(eq(t.attachments.groupId, groupId));
      const currentSize = Number(sizeRow?.s ?? 0);
      if (currentSize + input.sizeBytes > GROUP_FILE_TOTAL_QUOTA) {
        return { ok: false as const, reason: "group_quota_exceeded" as const };
      }
    }

    const [row] = await tx.insert(t.attachments).values({
      ownerId: input.ownerId,
      applicationId: input.applicationId,
      groupId,
      originalName: input.originalName,
      storedFilename: input.storedFilename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      scanStatus: input.scanStatus,
      expiresAt: input.expiresAt ?? null,
    }).returning({ id: t.attachments.id });

    return { ok: true as const, id: row.id };
  });
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
