import { NextResponse } from "next/server";
import { z } from "zod";
import { isAllowedEmail, issueCode, allowedDomains } from "@/server/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = z.object({ email: z.string().email() }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "email 格式不正確" }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  if (!isAllowedEmail(email)) {
    return NextResponse.json(
      { error: `僅限校內信箱註冊(${allowedDomains().join("、")})` },
      { status: 403 },
    );
  }
  const code = await issueCode(email);
  // 開發環境:直接回傳驗證碼方便測試。正式環境改為寄信,絕不回傳。
  const dev = process.env.NODE_ENV !== "production";
  return NextResponse.json({ ok: true, ...(dev ? { devCode: code } : {}) });
}
