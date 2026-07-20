// M8 教授實驗室/計畫團隊群組
// ─────────────────────────────────────────────────────────────
// 設計紅線(架構書已定案):群組貼文一律不可公開,僅群組成員可見,無公開牆、
// 無跨群組轉發——維持「研究媒合工具」定位,避免社群化。
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { and, eq, desc, inArray } from "drizzle-orm";

export async function createGroup(ownerId: string, name: string, description: string) {
  const [group] = await db.insert(t.groups).values({ ownerId, name, description }).returning();
  await db.insert(t.groupMembers).values({ groupId: group.id, userId: ownerId, role: "owner" });
  return group;
}

export async function isGroupMember(groupId: string, userId: string): Promise<boolean> {
  const [row] = await db.select().from(t.groupMembers)
    .where(and(eq(t.groupMembers.groupId, groupId), eq(t.groupMembers.userId, userId)));
  return !!row;
}

export async function addMember(groupId: string, userId: string) {
  await db.insert(t.groupMembers).values({ groupId, userId }).onConflictDoNothing();
}

export async function removeMember(groupId: string, userId: string) {
  await db.delete(t.groupMembers).where(and(eq(t.groupMembers.groupId, groupId), eq(t.groupMembers.userId, userId)));
}

export async function listMyGroups(userId: string) {
  const memberships = await db.select().from(t.groupMembers).where(eq(t.groupMembers.userId, userId));
  if (memberships.length === 0) return [];
  return db.select().from(t.groups).where(inArray(t.groups.id, memberships.map((m) => m.groupId)));
}

export async function getGroup(id: string) {
  const [row] = await db.select().from(t.groups).where(eq(t.groups.id, id));
  return row ?? null;
}

export async function listGroupMembers(groupId: string) {
  const members = await db.select().from(t.groupMembers).where(eq(t.groupMembers.groupId, groupId));
  const users = await Promise.all(members.map((m) => db.select().from(t.users).where(eq(t.users.id, m.userId))));
  return members.map((m, i) => ({ ...m, user: users[i][0] }));
}

export async function listMemberEmails(groupId: string) {
  const rows = await listGroupMembers(groupId);
  return rows.map((r) => r.user?.email).filter(Boolean) as string[];
}

/** 依信箱邀請(必須是已存在的校內帳號),避免建立不存在使用者的殘留紀錄。 */
export async function inviteByEmail(groupId: string, email: string): Promise<boolean> {
  const [user] = await db.select().from(t.users).where(eq(t.users.email, email.toLowerCase()));
  if (!user) return false;
  await addMember(groupId, user.id);
  return true;
}

export async function createPost(groupId: string, authorId: string, body: string) {
  const [row] = await db.insert(t.groupPosts).values({ groupId, authorId, body }).returning();
  return row;
}

export async function listPosts(groupId: string) {
  const posts = await db.select().from(t.groupPosts).where(eq(t.groupPosts.groupId, groupId)).orderBy(desc(t.groupPosts.createdAt));
  const authors = await Promise.all(posts.map((p) => db.select().from(t.users).where(eq(t.users.id, p.authorId))));
  return posts.map((p, i) => ({ ...p, author: authors[i][0] }));
}
