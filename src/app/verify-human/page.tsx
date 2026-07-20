// §3.4:僅在被判定為高風險瀏覽模式時才會導向這裡。
// 正式環境:設定 TURNSTILE_SECRET_KEY 後,下方表單應替換為 Cloudflare Turnstile 元件
// (呼叫端邏輯已在 src/server/captcha.ts 的 verifyTurnstileToken 準備好,僅需替換此頁 UI)。
import { verifyHumanAction } from "./actions";

export default function VerifyHumanPage({ searchParams }: { searchParams: { next?: string } }) {
  const a = Math.floor(Math.random() * 8) + 1;
  const b = Math.floor(Math.random() * 8) + 1;
  return (
    <>
      <h1>請完成驗證</h1>
      <p className="lede">
        系統偵測到短時間內有大量瀏覽行為,為了保護教授資料不被大量自動化擷取,
        請先完成下方簡單驗證再繼續瀏覽。一般使用者手動瀏覽不會遇到這一步。
      </p>
      <form className="stack" action={verifyHumanAction}>
        <input type="hidden" name="next" value={searchParams.next || "/"} />
        <input type="hidden" name="a" value={a} />
        <input type="hidden" name="b" value={b} />
        <label htmlFor="answer">{a} + {b} = ?</label>
        <input id="answer" name="answer" type="number" required autoFocus />
        <p><button>驗證並繼續</button></p>
      </form>
    </>
  );
}
