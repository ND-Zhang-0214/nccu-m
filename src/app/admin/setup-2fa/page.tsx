// §2.5:管理員帳號強制雙因素驗證。首次進入管理後台且尚未啟用 2FA 時,會被導來這裡。
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth";
import { generateSecret, getOtpauthUrl } from "@/server/totp";
import { setupTotpAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function Setup2FAPage({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  const user = await currentUser();
  if (!user || user.role !== "ADMIN") redirect("/");
  if (user.totpEnabled) redirect(searchParams.next || "/admin");

  const secret = generateSecret();
  const otpauthUrl = getOtpauthUrl(secret, user.email);

  return (
    <>
      <h1>設定雙因素驗證</h1>
      <p className="lede">
        管理員帳號可存取全平台使用者資料,依安全規範強制啟用雙因素驗證(TOTP),
        未完成設定前無法進入管理後台。
      </p>
      <ol style={{ fontSize: 14.5, lineHeight: 1.9 }}>
        <li>在手機安裝任一 TOTP 驗證器 App(如 Google Authenticator、Authy)。</li>
        <li>掃描或手動輸入以下金鑰新增帳戶:</li>
      </ol>
      <div className="terms-box" style={{ fontFamily: "monospace", fontSize: 15, wordBreak: "break-all" }}>
        {secret}
      </div>
      <p className="lede" style={{ fontSize: 12.5 }}>
        （或直接使用此連結:<span style={{ wordBreak: "break-all" }}>{otpauthUrl}</span>）
      </p>

      {searchParams.error && <div className="notice">驗證碼不正確,請重新輸入 App 上顯示的六位數。</div>}

      <form className="stack" action={setupTotpAction}>
        <input type="hidden" name="secret" value={secret} />
        <input type="hidden" name="next" value={searchParams.next || "/admin"} />
        <label htmlFor="code">App 上顯示的六位數驗證碼</label>
        <input id="code" name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required />
        <p><button>啟用並繼續</button></p>
      </form>
    </>
  );
}
