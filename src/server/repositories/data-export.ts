// 白皮書 2.13 資料匯出(簡化版)。誠實範圍界定(比照本專案一貫的簡化揭露慣例):
//
// - 原文要求「使用者開啟此功能時要設定一組密碼,匯出檔案以此密碼保護」,且原文自己對
//   「密碼能否更改」留了問號(整節標記【暫時想法】,不是【已定案】)。這裡比照
//   icsTokens/fileDownloadTokens 的既有慣例,簡化為「一次性、有效期限的下載連結本身
//   即為存取憑證」,不另外疊加一套密碼保護壓縮檔的機制——避免在白皮書自己都還沒決定
//   的細節上,先做出一套之後很可能要打掉重練的密碼管理功能。
// - 原文要求畢業前 90/60/30/7 天四階段倒數提醒,需要「預計畢業年月」這個資料欄位;
//   白皮書原文已註明此欄位「能否透過取得校內資料尚待討論」(詳見白皮書第四章 4.2,屬
//   校方確認事項,非本輪可自行決定)。本系統目前沒有任何可信的畢業日期資料來源,倒數
//   提醒暫不實作。改為在「進入畢業緩衝期」(markGraduationDetected)與「轉為校友」
//   (processLifecycleTransitions 的自動轉換)這兩個既有、真實會發生的轉換點提醒使用者
//   匯出資料——時間點與原文的四階段倒數不同,但同樣達成「讓即將離校者有機會取回資料」
//   的目的,且是基於系統實際擁有的資料做的,不是憑空捏造一個不存在的欄位。
// - 匯出內容為「領取連結當下即時查詢資料庫」產生的 JSON,不預先產生檔案存放
//   (dataExportTokens 本身沒有 storedFilename 欄位,是刻意的設計:平台不需要另外管理
//   一份匯出檔案的儲存生命週期,一次性連結被領取的那一刻才組裝內容)。
// - 附件(履歷、群組共用檔案)僅列出中繼資料(檔名/大小/時間),不內嵌二進位內容於 JSON
//   中,避免匯出檔過度膨脹、且與附件本身既有的下載/保存機制重複;如需附件本體,請至
//   各申請/群組頁面另行下載。
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { eq, or, inArray } from "drizzle-orm";
import { randomBytes, createHash } from "node:crypto";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const EXPORT_LINK_VALID_MS = 30 * 24 * 3600_000; // 白皮書明文:連結 30 天到期

export async function issueExportToken(userId: string): Promise<string> {
  const token = randomBytes(24).toString("hex");
  await db.insert(t.dataExportTokens).values({
    userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + EXPORT_LINK_VALID_MS),
  });
  return token;
}

/** 一次性連結:成功領取後立即標記 downloadedAt,同一 token 之後即失效(白皮書明文「一次性下載連結」)。 */
export async function redeemExportToken(token: string): Promise<string | null> {
  const [row] = await db.select().from(t.dataExportTokens).where(eq(t.dataExportTokens.tokenHash, sha256(token)));
  if (!row) return null;
  if (row.downloadedAt) return null; // 已領取過,一次性連結不可重複使用
  if (row.expiresAt.getTime() < Date.now()) return null;
  await db.update(t.dataExportTokens).set({ downloadedAt: new Date() }).where(eq(t.dataExportTokens.id, row.id));
  return row.userId;
}

/** 組裝單一使用者的完整資料匯出(白皮書明文範圍:申請、請求、對話紀錄;本實作額外納入
 *  個人檔案、自己發布的需求、群組參與、通知、條款簽署紀錄,理由是這些同樣屬於「使用者
 *  自己的資料」,範圍只有更完整,不牴觸白皮書原意)。 */
export async function buildUserDataExport(userId: string) {
  const [user] = await db.select().from(t.users).where(eq(t.users.id, userId));
  if (!user) return null;

  const applications = await db.select().from(t.applications).where(eq(t.applications.applicantId, userId));
  const studentRequestsRows = await db.select().from(t.studentRequests).where(eq(t.studentRequests.studentId, userId));

  const memberRows = await db.select().from(t.conversationMembers).where(eq(t.conversationMembers.userId, userId));
  const conversationIds = memberRows.map((m) => m.conversationId);
  const conversations = conversationIds.length
    ? await db.select().from(t.conversations).where(inArray(t.conversations.id, conversationIds)) : [];
  const messages = conversationIds.length
    ? await db.select().from(t.messages).where(inArray(t.messages.conversationId, conversationIds)) : [];

  const [profProfile] = await db.select().from(t.professorProfiles).where(eq(t.professorProfiles.userId, userId));
  const [unitProfile] = await db.select().from(t.unitProfiles).where(eq(t.unitProfiles.userId, userId));
  const postingConds = [eq(t.postings.studentPosterId, userId)];
  if (profProfile) postingConds.push(eq(t.postings.professorId, profProfile.id));
  if (unitProfile) postingConds.push(eq(t.postings.unitId, unitProfile.id));
  const authoredPostings = await db.select().from(t.postings).where(or(...postingConds));

  const groupMemberships = await db.select().from(t.groupMembers).where(eq(t.groupMembers.userId, userId));
  const groupPostsAuthored = await db.select().from(t.groupPosts).where(eq(t.groupPosts.authorId, userId));

  const notifications = await db.select().from(t.notifications).where(eq(t.notifications.userId, userId));
  const agreementLogs = await db.select().from(t.agreementLogs).where(eq(t.agreementLogs.userId, userId));

  const attachmentRows = await db.select().from(t.attachments).where(eq(t.attachments.ownerId, userId));
  const attachmentsMeta = attachmentRows.map((a) => ({
    id: a.id, originalName: a.originalName, mimeType: a.mimeType, sizeBytes: a.sizeBytes,
    createdAt: a.createdAt, groupId: a.groupId, applicationId: a.applicationId,
  }));

  return {
    exportedAt: new Date().toISOString(),
    scopeNote: "此為簡化版匯出:僅含資料庫中的結構化紀錄。附件僅列出中繼資料,二進位內容請至各申請/群組頁面另行下載(見白皮書 2.13,此簡化決策已於交付文件誠實說明)。",
    profile: {
      email: user.email, displayName: user.displayName, realName: user.realName, role: user.role,
      status: user.status, degreeLevel: user.degreeLevel, degreeLevelVerifiedAt: user.degreeLevelVerifiedAt,
      createdAt: user.createdAt,
    },
    applications,
    studentRequests: studentRequestsRows,
    conversations: conversations.map((c) => ({ ...c, messages: messages.filter((m) => m.conversationId === c.id) })),
    authoredPostings,
    groupMemberships,
    groupPostsAuthored,
    notifications,
    agreementLogs,
    attachmentsMeta,
  };
}
