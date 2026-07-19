import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { and, desc, eq } from "drizzle-orm";

export async function notify(userId: string, type: string, title: string, body = "", link = "") {
  await db.insert(t.notifications).values({ userId, type, title, body, link });
}

export async function listNotifications(userId: string) {
  return db.select().from(t.notifications)
    .where(eq(t.notifications.userId, userId))
    .orderBy(desc(t.notifications.createdAt));
}

export async function countUnread(userId: string) {
  const rows = await db.select().from(t.notifications)
    .where(and(eq(t.notifications.userId, userId), eq(t.notifications.isRead, false)));
  return rows.length;
}

export async function markAllRead(userId: string) {
  await db.update(t.notifications).set({ isRead: true })
    .where(and(eq(t.notifications.userId, userId), eq(t.notifications.isRead, false)));
}
