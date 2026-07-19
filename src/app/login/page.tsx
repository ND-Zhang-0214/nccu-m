"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [msg, setMsg] = useState("");
  const [devCode, setDevCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg("");
    const res = await fetch("/api/auth/request-code", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setMsg(data.error); return; }
    if (data.devCode) setDevCode(data.devCode);
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg("");
    const res = await fetch("/api/auth/verify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setMsg(data.error); return; }
    router.push("/terms"); router.refresh();
  }

  return (
    <>
      <h1>登入</h1>
      <p className="lede">僅限校內信箱。輸入信箱後系統會寄送六位數驗證碼(示範環境直接顯示於畫面)。</p>
      {step === "email" ? (
        <form className="stack" onSubmit={requestCode}>
          <label htmlFor="email">校內信箱</label>
          <input id="email" type="email" value={email} required
            placeholder="s1234567@g.nccu.edu.tw" onChange={(e) => setEmail(e.target.value)} />
          <p><button disabled={busy}>{busy ? "處理中…" : "取得驗證碼"}</button></p>
        </form>
      ) : (
        <form className="stack" onSubmit={verify}>
          {devCode && <div className="notice ok">示範環境驗證碼:<strong>{devCode}</strong>(正式環境會改為寄送至信箱)</div>}
          <label htmlFor="code">六位數驗證碼</label>
          <input id="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code}
            required onChange={(e) => setCode(e.target.value)} />
          <p><button disabled={busy}>{busy ? "驗證中…" : "登入"}</button></p>
        </form>
      )}
      {msg && <div className="notice">{msg}</div>}
    </>
  );
}
