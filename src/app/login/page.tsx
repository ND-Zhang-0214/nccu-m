"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { quickLoginAction } from "@/app/actions";
import { DEMO_PERSONAS } from "@/shared/categories";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // next 的安全性檢查與 src/server/auth.ts 的 isSafeNextPath() 邏輯相同,但這裡是 client
  // component 不能直接 import 該檔案(它牽動 db client 等伺服器端相依),故重複這段極簡單
  // 的三行判斷——只有通過的值才會被當成有效的 next 使用,其餘一律視為沒有 next。
  const nextRaw = searchParams.get("next") || "";
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") && !nextRaw.includes("://") ? nextRaw : "";

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
    // 白皮書 2.11.4 登入門檻上線後,大部分登入是從某個受保護頁面被導來的(帶著 next),
    // 登入成功後應該先去簽署條款(如未簽過),再送回原本要去的地方,而不是一律停在 /terms。
    router.push(next ? `/terms?next=${encodeURIComponent(next)}` : "/terms");
    router.refresh();
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

      {process.env.NODE_ENV !== "production" && (
        <>
          <hr style={{ margin: "28px 0 20px", border: 0, borderTop: "1px solid var(--hairline)" }} />
          <h2 style={{ fontSize: 15 }}>示範環境快速登入</h2>
          <p className="lede" style={{ fontSize: 13 }}>
            僅供 present 使用,略過驗證碼直接以示範帳號取得 session;正式環境(next build 後以
            NODE_ENV=production 執行)不會顯示這一區,伺服器端 quickLoginAction 也會直接拒絕執行。
          </p>
          {DEMO_PERSONAS.map((p) => (
            <form key={p.key} className="stack" action={quickLoginAction}>
              <input type="hidden" name="persona" value={p.key} />
              <input type="hidden" name="next" value={next} />
              <p style={{ marginTop: 4, marginBottom: 4 }}><button className="secondary">一鍵登入:{p.label}</button></p>
            </form>
          ))}
        </>
      )}
    </>
  );
}

export default function Login() {
  // useSearchParams() 依 Next.js App Router 規定需要包在 Suspense 邊界內,否則會讓
  // 整頁在建置時被迫改為純 client-side rendering(甚至可能導致 next build 失敗)。
  return (
    <Suspense fallback={<p className="lede">載入中…</p>}>
      <LoginForm />
    </Suspense>
  );
}
