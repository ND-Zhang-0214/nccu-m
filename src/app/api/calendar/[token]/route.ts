// M7 ics 行事曆訂閱端點:token 90–180 天到期(見 interviews.ts),與 session 脫鉤,
// 讓外部行事曆軟體(Google/Apple/Outlook)可以長期輪詢訂閱,不需要每次都登入。
import { NextResponse } from "next/server";
import { resolveIcsToken, generateIcsFeed } from "@/server/repositories/interviews";

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const row = await resolveIcsToken(params.token);
  if (!row) return NextResponse.json({ error: "連結已過期或無效,請重新產生訂閱連結。" }, { status: 404 });
  const ics = await generateIcsFeed(row.userId);
  return new NextResponse(ics, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="interviews.ics"' },
  });
}
