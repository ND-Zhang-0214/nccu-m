import { NextResponse } from "next/server";
import { currentUser } from "@/server/auth";
import { MAX_FILE_SIZE, detectFileType, saveFile, deleteFile } from "@/server/storage";
import { scanBuffer } from "@/server/scan";
import { createAttachmentIfUnderQuota } from "@/server/repositories/attachments";
import { getApplication } from "@/server/repositories/postings";
import { audit } from "@/server/repositories/audit";
import { logSecurityEvent } from "@/server/repositories/security";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "請先登入。" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤。" }, { status: 400 });
  }

  const file = form.get("file");
  const applicationId = form.get("applicationId");
  if (!(file instanceof File)) return NextResponse.json({ error: "未收到檔案。" }, { status: 400 });

  // §6 大小上限:在讀取檔案內容前就先用宣告大小擋一次,避免處理過大檔案浪費資源;
  // 讀取後再用實際 buffer 長度覆核一次(宣告值可能與實際不符)。
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: `檔案超過大小上限(${MAX_FILE_SIZE / 1024 / 1024}MB)。` }, { status: 413 });
  }

  const arrayBuf = await file.arrayBuffer();
  const buf = Buffer.from(arrayBuf);
  if (buf.length > MAX_FILE_SIZE) {
    return NextResponse.json({ error: `檔案超過大小上限(${MAX_FILE_SIZE / 1024 / 1024}MB)。` }, { status: 413 });
  }

  // §6 類型白名單:一律以 magic number 判斷,完全不採信檔名副檔名或瀏覽器回報的 Content-Type
  const detected = detectFileType(buf);
  if (!detected) {
    await logSecurityEvent("upload.rejected_type", "medium", user.id, "", { declaredType: file.type });
    return NextResponse.json({ error: "不支援的檔案類型,僅接受 PDF 或 Word 文件。" }, { status: 415 });
  }

  const scanResult = await scanBuffer(buf);
  if (scanResult !== "clean") {
    await logSecurityEvent("upload.scan_blocked", "high", user.id, "", { scanResult });
    return NextResponse.json({ error: "檔案未通過安全掃描,已拒絕上傳。" }, { status: 422 });
  }

  // 驗證申請歸屬(若有指定):只能替自己的申請掛附件
  let appId: string | null = null;
  if (typeof applicationId === "string" && applicationId) {
    const app = await getApplication(applicationId);
    if (!app || app.applicantId !== user.id) {
      return NextResponse.json({ error: "無法將附件關聯到此申請。" }, { status: 403 });
    }
    appId = applicationId;
  }

  const storedFilename = await saveFile(buf, detected.ext);

  // §6 + 負載測試修正:配額檢查與寫入包在同一原子交易,高併發下不會被繞過
  // (見 attachments.ts 的 createAttachmentIfUnderQuota 註解)。
  const result = createAttachmentIfUnderQuota({
    ownerId: user.id, applicationId: appId,
    originalName: (file.name || "file").slice(0, 200), // 只作顯示用,不做為儲存路徑
    storedFilename, mimeType: detected.mime, sizeBytes: buf.length, scanStatus: "clean",
  });

  if (!result.ok) {
    await deleteFile(storedFilename); // 沒配額就不留下孤兒檔案
    await logSecurityEvent("upload.rate_limited", "medium", user.id, "", {});
    return NextResponse.json({ error: "上傳過於頻繁,請稍後再試。" }, { status: 429 });
  }

  try {
    await audit(user.id, "attachment.upload", "ATTACHMENT", result.id, { mime: detected.mime, size: buf.length });
    return NextResponse.json({ ok: true, id: result.id });
  } catch {
    return NextResponse.json({ ok: true, id: result.id }); // 稽核寫入失敗不影響上傳本身已成功的事實,但仍應記錄(fail-open 僅限於此次要稽核動作)
  }
}
