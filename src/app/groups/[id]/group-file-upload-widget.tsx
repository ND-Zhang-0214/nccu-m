"use client";
// 白皮書 2.7.2:群組共用檔案區上傳元件。走 multipart 直傳 api/files/upload,
// 理由與既有 me/applications/upload-widget.tsx 相同——server action 不適合處理檔案二進位內容。
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function GroupFileUploadWidget({ groupId }: { groupId: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setMsg("");
    const form = new FormData();
    form.append("file", file);
    form.append("groupId", groupId);
    const res = await fetch("/api/files/upload", { method: "POST", body: form });
    const data = await res.json();
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (!res.ok) { setMsg(data.error); return; }
    setMsg("上傳成功。");
    router.refresh();
  }

  return (
    <div style={{ marginTop: 8 }}>
      <label style={{ fontSize: 13, color: "var(--muted)" }}>
        上傳共用檔案(PDF 或圖片,5MB 內):{" "}
        <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" disabled={busy} onChange={handleUpload} />
      </label>
      {busy && <span className="lede" style={{ fontSize: 12 }}> 上傳中…</span>}
      {msg && <div className="notice" style={{ marginTop: 6, fontSize: 13 }}>{msg}</div>}
    </div>
  );
}
