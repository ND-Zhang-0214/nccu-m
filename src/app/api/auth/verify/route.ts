import { NextResponse } from "next/server";
import { verifyCodeAndLogin, requestIp } from "@/server/auth";
import { audit } from "@/server/repositories/audit";
import { checkVerifyLock, recordVerifyAttempt } from "@/server/repositories/ratelimit";
import { verifySchema } from "@/server/schemas";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "輸入格式不正確" }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  const ip = requestIp();

  // §2.3 階梯式鎖定:連續錯誤達門檻後,鎖定該信箱一段時間,不再比對(即使碼是對的)。
  const lockedMs = await checkVerifyLock(email);
  if (lockedMs > 0) {
    return NextResponse.json(
      { error: `嘗試次數過多,請 ${Math.ceil(lockedMs / 60000)} 分鐘後再試。` },
      { status: 429 },
    );
  }

  const user = await verifyCodeAndLogin(email, parsed.data.code, {
    ip, userAgent: req.headers.get("user-agent") || "",
  });
  const delayMs = await recordVerifyAttempt(email, ip, !!user);
  if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs)); // 階梯式延遲,拉高暴力嘗試成本

  if (!user) return NextResponse.json({ error: "驗證碼錯誤或已過期" }, { status: 401 });
  await audit(user.id, "auth.login");
  return NextResponse.json({ ok: true });
}
