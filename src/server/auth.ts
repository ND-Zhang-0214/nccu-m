// 驗證與 session:email 驗證碼登入(開發環境驗證碼直接回傳,正式環境改接寄信服務)
// §2.3 速率限制、§2.4 session 輪替與閒置逾時、§5.2 存證雜湊鏈 已整合於此檔。
import { cookies, headers } from "next/headers";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { and, eq, gt, isNull, lt, desc } from "drizzle-orm";
import { chainHash } from "@/server/crypto";
import { getActiveIdentityProvider } from "@/server/auth/providers";
import { SESSION_COOKIE_NAME } from "@/server/session-cookie";

// session cookie 名稱獨立在 session-cookie.ts:middleware.ts(Edge runtime)需要讀同一個
// cookie 名稱做粗篩,但不能 import 這支檔案本身(頂層 import 了 db client,db client 底層
// 是 pg,用到 Node.js 原生 TCP/TLS socket,無法在 Edge runtime 打包),故拆出這支不含任何
// db/Node-only 依賴的極小檔案,兩邊各自 import,避免兩處各寫一份字串常數而漂移。
const COOKIE = SESSION_COOKIE_NAME;
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

/** 核發 session 的共用邏輯:不論是走真的驗證碼流程(verifyCodeAndLogin)或示範環境的
 *  一鍵快速登入(quickLoginDemo),都呼叫這裡取得使用者+開 session+設 cookie——避免
 *  兩套登入路徑各自維護一份邏輯而互相漂移(比照白皮書 1.5/2.2.1「登入來源可抽換」的
 *  既有設計精神)。 */
async function establishSession(email: string, providerId: string, meta?: { ip?: string; userAgent?: string }) {
  let [user] = await db.select().from(t.users).where(eq(t.users.email, email));
  if (!user) {
    // 白皮書 2.2.2:真實姓名與顯示名稱分離。demo 環境沒有 iNCCU 可回傳真實姓名,
    // 故以建立當下的預設暱稱作為 realName 的初始值——之後使用者若申請修改顯示名稱,
    // realName 不會跟著變動(見 updateDisplayName)。
    const defaultName = email.split("@")[0];
    [user] = await db.insert(t.users).values({
      email, displayName: defaultName, realName: defaultName,
    }).returning();
  }
  // 注意:SUSPENDED(休學)/ALUM(校友)/ARCHIVED(退學/封存)一律允許登入——
  // 架構書定調這些是「唯讀」狀態,不是「禁止存取」,使用者仍須能查看自己的歷史紀錄。
  // 真正的限制在於「能不能做出新的動作」(申請、發訊息等),那一層攔截在
  // src/server/authz.ts 的 requireActiveUser(),不是在登入這一關擋。

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
    userAgent: (meta?.userAgent || "").slice(0, 300),
    createdIp: meta?.ip || "",
    provider: providerId,
  });
  cookies().set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 86400, path: "/",
  });
  return user;
}

export async function verifyCodeAndLogin(email: string, code: string, meta?: { ip?: string; userAgent?: string }) {
  const [row] = await db.select().from(t.emailVerifications).where(and(
    eq(t.emailVerifications.email, email),
    eq(t.emailVerifications.code, sha256(code)),
    gt(t.emailVerifications.expiresAt, new Date()),
    isNull(t.emailVerifications.consumedAt),
  ));
  if (!row) return null;
  await db.update(t.emailVerifications).set({ consumedAt: new Date() })
    .where(eq(t.emailVerifications.id, row.id));

  // 白皮書 1.5/2.2.1「登入來源可抽換」:實際的碼比對邏輯留在這裡(避免跟資料庫細節
  // 分家、兩套邏輯互相漂移),但登入來源的「身分」由 identityProvider 決定與標記,
  // 未來換成 iNCCU 只需要換 getActiveIdentityProvider() 回傳的實作。
  const identity = await getActiveIdentityProvider().resolveIdentity({ email });
  if (!identity) return null;

  return establishSession(email, identity.provider, meta);
}

// 對應使用者要求「現在的版本要先設計一組虛擬可以直接通過的帳密或是登入方式讓我可以
// present」:示範用一鍵登入,略過輸入驗證碼的步驟直接取得 session。刻意只在非正式環境
// 開放——比照 api/auth/request-code 的 devCode 揭露判斷式用同一個 NODE_ENV 條件,
// 正式環境(next build 後以 NODE_ENV=production 執行)這支函式一律回傳 null,呼叫端
// (quickLoginAction)因此也一律導回登入頁,不會意外留在正式環境裡。
// 帳密仍然「虛擬」在於:沒有真的密碼欄位或任何人工核對動作,單純是換一種(非常寬鬆的)
// 身分核發方式,核發出來的 session 與真正走完驗證碼流程的 session 完全相同,不是假的
// session、也不會少寫任何一筆稽核紀錄。
export async function quickLoginDemo(email: string, meta?: { ip?: string; userAgent?: string }) {
  if (process.env.NODE_ENV === "production") return null;
  if (!isAllowedEmail(email)) return null;
  return establishSession(email, "demo-quick-login", meta);
}

/** 開放重導向防護:next 參數來自使用者可操控的網址,只允許站內相對路徑,
 *  拒絕 "//evil.com"(protocol-relative)與含 "://" 的絕對網址,避免被利用成釣魚連結。 */
export function isSafeNextPath(next: string | null | undefined): next is string {
  return !!next && next.startsWith("/") && !next.startsWith("//") && !next.includes("://");
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
