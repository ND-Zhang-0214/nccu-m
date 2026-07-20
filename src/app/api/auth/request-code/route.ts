import { NextResponse } from "next/server";
import { isAllowedEmail, issueCode, allowedDomains, requestIp } from "@/server/auth";
import { checkIssueCodeLimit, recordIssueCode } from "@/server/repositories/ratelimit";
import { emailSchema } from "@/server/schemas";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = emailSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "email 格式不正確" }, { status: 400 });
  const email = parsed.data.email.toLowerCase();

  if (!isAllowedEmail(email)) {
    return NextResponse.json(
      { error: `僅限校內信箱註冊(${allowedDomains().join("、")})` },
      { status: 403 },
    );
  }

  // §2.3 速率限制:同信箱/同來源 IP 皆有門檻,擋自動化大量索取驗證碼。
  const ip = requestIp();
  const limitError = await checkIssueCodeLimit(email, ip);
  if (limitError) return NextResponse.json({ error: limitError }, { status: 429 });

  const code = await issueCode(email);
  await recordIssueCode(email, ip);

  // 開發環境:直接回傳驗證碼方便測試。正式環境改為寄信,絕不回傳。
  const dev = process.env.NODE_ENV !== "production";
  return NextResponse.json({ ok: true, ...(dev ? { devCode: code } : {}) });
}
