import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCodeAndLogin } from "@/server/auth";
import { audit } from "@/server/repositories/audit";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = z.object({
    email: z.string().email(),
    code: z.string().length(6),
  }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "輸入格式不正確" }, { status: 400 });

  const user = await verifyCodeAndLogin(parsed.data.email.toLowerCase(), parsed.data.code);
  if (!user) return NextResponse.json({ error: "驗證碼錯誤或已過期" }, { status: 401 });
  await audit(user.id, "auth.login");
  return NextResponse.json({ ok: true });
}
