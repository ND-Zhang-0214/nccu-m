// 驗證與 session:email 驗證碼登入(開發環境驗證碼直接回傳,正式環境改接寄信服務)
import { cookies, headers } from "next/headers";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { and, eq, gt, isNull } from "drizzle-orm";

const COOKIE = "rm_session";
const SESSION_DAYS = 14;

export function allowedDomains(): string[] {
  return (process.env.ALLOWED_EMAIL_DOMAINS || "g.nccu.edu.tw,nccu.edu.tw")
    .split(",").map((s) => s.trim()).filter(Boolean);
}

export function isAllowedEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return !!domain && allowedDomains().includes(domain);
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function issueCode(email: string): Promise<string> {
  const code = String(randomInt(100000, 999999));
  await db.insert(t.emailVerifications).values({
    email, code: sha256(code), expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });
  // 正式環境:在此改為呼叫寄信服務,絕不回傳 code
  return code;
}

export async function verifyCodeAndLogin(email: string, code: string) {
  const [row] = await db.select().from(t.emailVerifications).where(and(
    eq(t.emailVerifications.email, email),
    eq(t.emailVerifications.code, sha256(code)),
    gt(t.emailVerifications.expiresAt, new Date()),
    isNull(t.emailVerifications.consumedAt),
  ));
  if (!row) return null;
  await db.update(t.emailVerifications).set({ consumedAt: new Date() })
    .where(eq(t.emailVerifications.id, row.id));

  let [user] = await db.select().from(t.users).where(eq(t.users.email, email));
  if (!user) {
    [user] = await db.insert(t.users).values({
      email, displayName: email.split("@")[0],
    }).returning();
  }
  if (user.status === "SUSPENDED" || user.status === "ARCHIVED") return null;

  const token = randomBytes(32).toString("hex");
  await db.insert(t.sessions).values({
    userId: user.id, tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86400 * 1000),
  });
  cookies().set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 86400, path: "/",
  });
  return user;
}

export async function currentUser() {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  const [session] = await db.select().from(t.sessions)
    .where(and(eq(t.sessions.tokenHash, sha256(token)), gt(t.sessions.expiresAt, new Date())));
  if (!session) return null;
  const [user] = await db.select().from(t.users).where(eq(t.users.id, session.userId));
  return user ?? null;
}

export async function logout() {
  const token = cookies().get(COOKIE)?.value;
  if (token) await db.delete(t.sessions).where(eq(t.sessions.tokenHash, sha256(token)));
  cookies().delete(COOKIE);
}

export function requestIp(): string {
  const h = headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

export async function hasSignedTerms(userId: string, version: string) {
  const [row] = await db.select().from(t.agreementLogs).where(and(
    eq(t.agreementLogs.userId, userId),
    eq(t.agreementLogs.docType, "TERMS"),
    eq(t.agreementLogs.version, version),
  ));
  return !!row;
}

export async function signTerms(userId: string, version: string, ip: string, userAgent: string) {
  await db.insert(t.agreementLogs).values({ userId, docType: "TERMS", version, ip, userAgent });
}
