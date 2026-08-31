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

  const { code, sent } = await issueCode(email);
  await recordIssueCode(email, ip);

  // 開發環境:直接回傳驗證碼方便測試。正式環境改為寄信,絕不回傳。
  const dev = process.env.NODE_ENV !== "production";
  if (dev) return NextResponse.json({ ok: true, devCode: code });

  // 正式環境:如果信真的沒寄出去(未設定 RESEND_API_KEY,或 Resend 回傳錯誤),
  // 不能悄悄回傳 ok:true——使用者會傻等一封永遠不會到的信。誠實回報「寄送失敗」,
  // 比假裝成功更負責任(對照 email.ts 檔頭說明)。
  if (!sent) {
    return NextResponse.json(
      { error: "驗證碼信件寄送失敗,請稍後再試;若持續發生,請聯絡系統管理員確認信箱服務設定。" },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}
