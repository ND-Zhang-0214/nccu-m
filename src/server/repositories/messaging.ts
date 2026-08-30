// 站內訊息(架構書 M4)+ 忙碌/有空狀態 + 分層揭露聯絡方式(§3.2、§5.1)
// ─────────────────────────────────────────────────────────────
// 頻率限制設計(對應架構書 M4「訊息頻率上限」):限制的是「媒合確認前,每帳號每日
// 可發起的新對話數」(3–5 則),不是對話內的訊息則數——已在對話中的雙方應能正常
// 溝通,設計上不該妨礙已建立關係的使用者。確認後(見 confirmConversation)無此限制。
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { and, eq, desc, asc, gte, count } from "drizzle-orm";
import { encryptField, decryptField } from "@/server/crypto";
import { logSecurityEvent } from "./security";
import { hasHideRelationship } from "./users";

const DAILY_NEW_CONVERSATION_LIMIT = 5;

export class ConversationLimitError extends Error {}

async function countNewConversationsToday(userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600_000);
  const rows = await db.select({ c: count() }).from(t.conversations)
    .innerJoin(t.conversationMembers, eq(t.conversationMembers.conversationId, t.conversations.id))
    .where(and(
      eq(t.conversationMembers.userId, userId),
      gte(t.conversations.createdAt, since),
    ));
  return rows[0]?.c ?? 0;
}

/** 取得或建立「依附於某申請」的對話(申請人 ↔ 該需求教授)。 */
export async function getOrCreateConversationForApplication(
  applicationId: string, applicantId: string, professorUserId: string,
) {
  const [existing] = await db.select().from(t.conversations)
    .where(and(eq(t.conversations.contextType, "APPLICATION"), eq(t.conversations.contextId, applicationId)));
  if (existing) return existing;

  // 白皮書 2.12.2:隱藏是雙向擋新互動(不論誰隱藏誰),但既有對話不受影響——這裡只在
  // 要「新建」對話時檢查,上面 existing 已提前 return 的既有對話不會被這條規則影響到。
  if (await hasHideRelationship(applicantId, professorUserId)) {
    throw new ConversationLimitError("目前無法與對方開啟新對話。");
  }

  const newCount = await countNewConversationsToday(applicantId);
  if (newCount >= DAILY_NEW_CONVERSATION_LIMIT) {
    await logSecurityEvent("message.rate_limited", "low", applicantId, "", { newCount });
    throw new ConversationLimitError("今日可發起的新對話數已達上限,請明天再試,或等待對方回覆現有對話。");
  }

  const [conv] = await db.insert(t.conversations).values({ contextType: "APPLICATION", contextId: applicationId }).returning();
  await db.insert(t.conversationMembers).values([
    { conversationId: conv.id, userId: applicantId },
    { conversationId: conv.id, userId: professorUserId },
  ]);
  return conv;
}

/** 媒合確認:解除新對話數限制的判斷依據(通常在申請通過時呼叫)。 */
export async function confirmConversationByApplication(applicationId: string) {
  await db.update(t.conversations).set({ confirmedAt: new Date() })
    .where(and(eq(t.conversations.contextType, "APPLICATION"), eq(t.conversations.contextId, applicationId)));
}

export async function isConversationMember(conversationId: string, userId: string): Promise<boolean> {
  const [row] = await db.select().from(t.conversationMembers)
    .where(and(eq(t.conversationMembers.conversationId, conversationId), eq(t.conversationMembers.userId, userId)));
  return !!row;
}

export async function listConversationsForUser(userId: string) {
  const memberships = await db.select().from(t.conversationMembers).where(eq(t.conversationMembers.userId, userId));
  const convIds = memberships.map((m) => m.conversationId);
  if (convIds.length === 0) return [];
  const { inArray } = await import("drizzle-orm");
  const convs = await db.select().from(t.conversations).where(inArray(t.conversations.id, convIds));

  const result = [];
  for (const conv of convs) {
    const members = await db.select().from(t.conversationMembers).where(eq(t.conversationMembers.conversationId, conv.id));
    const other = members.find((m) => m.userId !== userId);
    const otherUser = other ? (await db.select().from(t.users).where(eq(t.users.id, other.userId)))[0] : null;
    const [lastMsg] = await db.select().from(t.messages)
      .where(eq(t.messages.conversationId, conv.id)).orderBy(desc(t.messages.createdAt)).limit(1);
    result.push({ conv, otherUser, otherStatus: other?.status ?? "available", lastMsg });
  }
  return result.sort((a, b) => (b.lastMsg?.createdAt.getTime() ?? 0) - (a.lastMsg?.createdAt.getTime() ?? 0));
}

export async function getConversationDetail(conversationId: string, viewerId: string) {
  const [conv] = await db.select().from(t.conversations).where(eq(t.conversations.id, conversationId));
  if (!conv) return null;
  const members = await db.select().from(t.conversationMembers).where(eq(t.conversationMembers.conversationId, conversationId));
  const me = members.find((m) => m.userId === viewerId);
  if (!me) return null; // 非成員一律視為不存在,不洩漏對話存在與否(§2.2 IDOR 防護思路的延伸)
  const other = members.find((m) => m.userId !== viewerId);
  const otherUser = other ? (await db.select().from(t.users).where(eq(t.users.id, other.userId)))[0] : null;
  const msgs = await db.select().from(t.messages).where(eq(t.messages.conversationId, conversationId)).orderBy(asc(t.messages.createdAt));
  return { conv, me, other, otherUser, messages: msgs };
}

/** 管理員專用:不檢查是否為對話成員(呼叫端必須自行確保已通過 §2.5 雙人核可,
 *  這支函式本身不做授權判斷,只負責查資料——授權判斷集中在頁面/authz 層,
 *  避免「查資料」跟「判斷能不能查」的邏輯混在一起難以稽核)。 */
export async function getConversationDetailForAdmin(conversationId: string) {
  const [conv] = await db.select().from(t.conversations).where(eq(t.conversations.id, conversationId));
  if (!conv) return null;
  const members = await db.select().from(t.conversationMembers).where(eq(t.conversationMembers.conversationId, conversationId));
  const users = await Promise.all(members.map((m) => db.select().from(t.users).where(eq(t.users.id, m.userId))));
  const msgs = await db.select().from(t.messages).where(eq(t.messages.conversationId, conversationId)).orderBy(asc(t.messages.createdAt));
  return {
    conv,
    members: members.map((m, i) => ({ ...m, user: users[i][0] })),
    messages: msgs,
  };
}

export async function sendMessage(conversationId: string, senderId: string, body: string) {
  const [row] = await db.insert(t.messages).values({ conversationId, senderId, body }).returning();
  return row;
}

/** 忙碌/有空狀態:雙方各自手動設定,系統不做自動偵測(對應本次 UX 決策調整)。 */
export async function setMemberStatus(conversationId: string, userId: string, status: "available" | "away", note: string) {
  await db.update(t.conversationMembers).set({ status, statusNote: note.slice(0, 100) })
    .where(and(eq(t.conversationMembers.conversationId, conversationId), eq(t.conversationMembers.userId, userId)));
}

// ── 使用者自己的聯絡方式(加密儲存)────────────────────────

export async function setUserContact(userId: string, kind: string, value: string) {
  await db.insert(t.userContacts).values({ userId, kind, valueEnc: encryptField(value) });
}

export async function listUserContacts(userId: string) {
  const rows = await db.select().from(t.userContacts).where(eq(t.userContacts.userId, userId));
  return rows.map((r) => ({ ...r, value: decryptField(r.valueEnc) }));
}

export async function deleteUserContact(id: string, userId: string) {
  await db.delete(t.userContacts).where(and(eq(t.userContacts.id, id), eq(t.userContacts.userId, userId)));
}

// ── 分層揭露(§3.2):僅在對話中、經當事人主動動作才揭露 ──────

/** 把某使用者「目前」的某類聯絡方式,揭露進一個對話,並留下揭露事件(存證,不可竄改此紀錄)。 */
export async function discloseContact(conversationId: string, discloserId: string, contactId: string) {
  const [contact] = await db.select().from(t.userContacts)
    .where(and(eq(t.userContacts.id, contactId), eq(t.userContacts.userId, discloserId)));
  if (!contact) throw new Error("找不到此聯絡方式");
  await db.insert(t.contactDisclosures).values({
    conversationId, discloserId, kind: contact.kind, valueEnc: contact.valueEnc,
  });
}

/** 某對話裡,「對方」對「我」揭露過的聯絡方式(只回傳別人揭露給我的,不回傳我自己的)。 */
export async function listDisclosedToMe(conversationId: string, viewerId: string) {
  const rows = await db.select().from(t.contactDisclosures)
    .where(eq(t.contactDisclosures.conversationId, conversationId));
  return rows.filter((r) => r.discloserId !== viewerId)
    .map((r) => ({ ...r, value: decryptField(r.valueEnc) }));
}
