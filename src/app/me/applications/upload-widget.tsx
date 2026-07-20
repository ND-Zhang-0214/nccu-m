"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function UploadWidget({ applicationId }: { applicationId: string }) {
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
    form.append("applicationId", applicationId);
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
        附上履歷/研究草稿(PDF 或 Word,10MB 內):{" "}
        <input ref={inputRef} type="file" accept=".pdf,.docx" disabled={busy} onChange={handleUpload} />
      </label>
      {busy && <span className="lede" style={{ fontSize: 12 }}> 上傳中…</span>}
      {msg && <div className="notice" style={{ marginTop: 6, fontSize: 13 }}>{msg}</div>}
    </div>
  );
}
