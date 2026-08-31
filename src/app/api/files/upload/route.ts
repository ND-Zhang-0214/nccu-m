import { NextResponse } from "next/server";
import { currentUser } from "@/server/auth";
import {
  MAX_FILE_SIZE, detectFileType, saveFile, deleteFile,
  GROUP_FILE_MAX_SIZE, GROUP_FILE_RETENTION_MS, GROUP_FILE_ALLOWED_EXTS, APPLICATION_FILE_ALLOWED_EXTS,
} from "@/server/storage";
import { scanBuffer } from "@/server/scan";
import { createAttachmentIfUnderQuota } from "@/server/repositories/attachments";
import { getApplication } from "@/server/repositories/postings";
import { isGroupMember } from "@/server/repositories/groups";
import { audit } from "@/server/repositories/audit";
import { logSecurityEvent } from "@/server/repositories/security";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "請先登入。" }, { status: 401 });
  if (user.status !== "ACTIVE") {
    return NextResponse.json({ error: "此帳號目前為唯讀狀態,無法上傳新檔案。" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤。" }, { status: 400 });
  }

  const file = form.get("file");
  const applicationId = form.get("applicationId");
  const groupId = form.get("groupId");
  if (!(file instanceof File)) return NextResponse.json({ error: "未收到檔案。" }, { status: 400 });

  // 白皮書 2.7.2:群組檔案單檔上限比一般附件更嚴格(5MB vs 10MB)。
  const isGroupUpload = typeof groupId === "string" && !!groupId;
  const sizeCap = isGroupUpload ? GROUP_FILE_MAX_SIZE : MAX_FILE_SIZE;

  // §6 大小上限:在讀取檔案內容前就先用宣告大小擋一次,避免處理過大檔案浪費資源;
  // 讀取後再用實際 buffer 長度覆核一次(宣告值可能與實際不符)。
  if (file.size > sizeCap) {
    return NextResponse.json({ error: `檔案超過大小上限(${sizeCap / 1024 / 1024}MB)。` }, { status: 413 });
  }

  const arrayBuf = await file.arrayBuffer();
  const buf = Buffer.from(arrayBuf);
  if (buf.length > sizeCap) {
    return NextResponse.json({ error: `檔案超過大小上限(${sizeCap / 1024 / 1024}MB)。` }, { status: 413 });
  }

  // §6 類型白名單:一律以 magic number 判斷,完全不採信檔名副檔名或瀏覽器回報的 Content-Type。
  // 白皮書 2.7.2:群組檔案只收 PDF/圖片,與一般附件(PDF/Word)是不同的情境專屬白名單——
  // detectFileType() 本身只負責辨識格式,是否「這個情境允許這個格式」在此另外把關。
  const detected = detectFileType(buf);
  const allowedExts = isGroupUpload ? GROUP_FILE_ALLOWED_EXTS : APPLICATION_FILE_ALLOWED_EXTS;
  if (!detected || !allowedExts.has(detected.ext)) {
    await logSecurityEvent("upload.rejected_type", "medium", user.id, "", { declaredType: file.type, context: isGroupUpload ? "group" : "application" });
    const msg = isGroupUpload ? "不支援的檔案類型,群組檔案僅接受 PDF 或圖片(JPG/PNG)。" : "不支援的檔案類型,僅接受 PDF 或 Word 文件。";
    return NextResponse.json({ error: msg }, { status: 415 });
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

  // 驗證群組成員身分(若有指定):只有該群組成員可上傳到該群組(白皮書 2.7.2)。
  let gId: string | null = null;
  let expiresAt: Date | null = null;
  if (isGroupUpload) {
    const member = await isGroupMember(groupId, user.id);
    if (!member) {
      await logSecurityEvent("authz.denied", "high", user.id, "", { resource: "GROUP_FILE_UPLOAD", id: groupId });
      return NextResponse.json({ error: "你不是此群組成員,無法上傳檔案。" }, { status: 403 });
    }
    gId = groupId;
    expiresAt = new Date(Date.now() + GROUP_FILE_RETENTION_MS);
  }

  const storedFilename = await saveFile(buf, detected.ext);

  // §6 + 負載測試修正:配額檢查與寫入包在同一原子交易,高併發下不會被繞過
  // (見 attachments.ts 的 createAttachmentIfUnderQuota 註解)。
  const result = await createAttachmentIfUnderQuota({
    ownerId: user.id, applicationId: appId, groupId: gId,
    originalName: (file.name || "file").slice(0, 200), // 只作顯示用,不做為儲存路徑
    storedFilename, mimeType: detected.mime, sizeBytes: buf.length, scanStatus: "clean", expiresAt,
  });

  if (!result.ok) {
    await deleteFile(storedFilename); // 沒配額就不留下孤兒檔案
    if (result.reason === "group_quota_exceeded") {
      await logSecurityEvent("upload.group_quota_exceeded", "low", user.id, "", { groupId: gId });
      return NextResponse.json({ error: "此群組的檔案總量已達 100MB 上限,請先刪除不需要的檔案。" }, { status: 413 });
    }
    await logSecurityEvent("upload.rate_limited", "medium", user.id, "", {});
    return NextResponse.json({ error: "上傳過於頻繁,請稍後再試。" }, { status: 429 });
  }

  try {
    await audit(user.id, "attachment.upload", "ATTACHMENT", result.id, { mime: detected.mime, size: buf.length, groupId: gId });
    return NextResponse.json({ ok: true, id: result.id });
  } catch {
    return NextResponse.json({ ok: true, id: result.id }); // 稽核寫入失敗不影響上傳本身已成功的事實,但仍應記錄(fail-open 僅限於此次要稽核動作)
  }
}
