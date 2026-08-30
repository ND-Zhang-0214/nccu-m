// 白皮書 2.13 資料匯出:一次性簽名連結端點,與 ics/calendar、files/download 同慣例——
// token 本身就是授權憑證,不做 session 驗證(領取當下才組裝內容,見 data-export.ts 檔頭)。
import { NextResponse } from "next/server";
import { redeemExportToken, buildUserDataExport } from "@/server/repositories/data-export";

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const userId = await redeemExportToken(params.token);
  if (!userId) return NextResponse.json({ error: "連結已過期、已使用或無效。" }, { status: 404 });

  const data = await buildUserDataExport(userId);
  if (!data) return NextResponse.json({ error: "找不到對應的帳號資料。" }, { status: 404 });

  const filename = `nccu-data-export-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
