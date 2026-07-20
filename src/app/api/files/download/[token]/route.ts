// §6/§5.2:時效簽名連結下載端點。僅接受未過期的 token,不做 session 驗證——
// token 本身就是授權憑證,由 requestFileLinkAction 在存取控制通過後才核發。
import { NextResponse } from "next/server";
import { resolveDownloadToken } from "@/server/repositories/attachments";
import { readFile } from "@/server/storage";
import { logSecurityEvent } from "@/server/repositories/security";

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const att = await resolveDownloadToken(params.token);
  if (!att) {
    await logSecurityEvent("download.invalid_token", "low", null, "", {});
    return NextResponse.json({ error: "連結已過期或無效。" }, { status: 404 });
  }
  try {
    const buf = await readFile(att.storedFilename);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": att.mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(att.originalName)}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "檔案讀取失敗。" }, { status: 500 });
  }
}
