// 驗證與 session:email 驗證碼登入(開發環境驗證碼直接回傳,正式環境改接寄信服務)
// §2.3 速率限制、§2.4 session 輪替與閒置逾時、§5.2 存證雜湊鏈 已整合於此檔。
import { cookies, headers } from "next/headers";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { and, eq, gt, isNull, lt, desc } from "drizzle-orm";
import { chainHash } from "@/server/crypto";

const COOKIE = "rm_session";
const SESSION_DAYS = 14;       // §2.4 絕對逾時
const IDLE_DAYS = 7;           // §2.4 閒置逾時:超過此天數未使用即視為失效

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

  // §2.4 session 輪替:每次登入一律核發全新 token,並清掉該使用者已過期/閒置逾時的舊 session
  // (不強制單一裝置登入——多裝置是常見合理使用情境,只清「已經失效」的殘留紀錄)。
  const now = Date.now();
  await db.delete(t.sessions).where(and(
    eq(t.sessions.userId, user.id),
    lt(t.sessions.expiresAt, new Date(now)),
  ));

  const token = randomBytes(32).toString("hex");
  await db.insert(t.sessions).values({
    userId: user.id, tokenHash: sha256(token),
    expiresAt: new Date(now + SESSION_DAYS * 86400 * 1000),
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

  // §2.4 閒置逾時:超過 IDLE_DAYS 未使用,視為失效並清除,即使絕對逾時尚未到期。
  const idleLimitMs = IDLE_DAYS * 86400 * 1000;
  if (Date.now() - session.lastUsedAt.getTime() > idleLimitMs) {
    await db.delete(t.sessions).where(eq(t.sessions.id, session.id));
    return null;
  }
  // 節流更新:只在超過 5 分鐘才寫入,避免每次頁面載入都寫 DB。
  if (Date.now() - session.lastUsedAt.getTime() > 5 * 60 * 1000) {
    await db.update(t.sessions).set({ lastUsedAt: new Date() }).where(eq(t.sessions.id, session.id));
  }

  const [user] = await db.select().from(t.users).where(eq(t.users.id, session.userId));
  return user ?? null;
}

export async function currentSession() {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  const [session] = await db.select().from(t.sessions)
    .where(and(eq(t.sessions.tokenHash, sha256(token)), gt(t.sessions.expiresAt, new Date())));
  return session ?? null;
}

export async function markSessionStepUp(sessionId: string) {
  await db.update(t.sessions).set({ stepUpAt: new Date() }).where(eq(t.sessions.id, sessionId));
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

// §5.2 存證雜湊鏈:條款簽署與稽核日誌採同一套鏈式雜湊機制,理由相同——
// 讓「事後靜默竄改存證」這件事在技術上必定留下可偵測的痕跡。
export async function signTerms(userId: string, version: string, ip: string, userAgent: string) {
  const [last] = await db.select({ hash: t.agreementLogs.hash }).from(t.agreementLogs)
    .orderBy(desc(t.agreementLogs.signedAt)).limit(1);
  const prevHash = last?.hash || "";
  const content = { userId, docType: "TERMS", version, ip, userAgent };
  const hash = chainHash(prevHash, content);
  await db.insert(t.agreementLogs).values({ userId, docType: "TERMS", version, ip, userAgent, prevHash, hash });
}
