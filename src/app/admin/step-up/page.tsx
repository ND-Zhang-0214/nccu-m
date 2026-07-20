// §2.5:管理員已啟用 2FA,但距上次重驗超過 30 分鐘,進入敏感頁面前需重新驗證。
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth";
import { stepUpTotpAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function StepUpPage({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  const user = await currentUser();
  if (!user || user.role !== "ADMIN") redirect("/");

  return (
    <>
      <h1>請重新驗證</h1>
      <p className="lede">為保護管理權限,距上次驗證已超過時效,請輸入驗證器 App 上目前顯示的六位數。</p>
      {searchParams.error && <div className="notice">驗證碼不正確或已過期,請再試一次。</div>}
      <form className="stack" action={stepUpTotpAction}>
        <input type="hidden" name="next" value={searchParams.next || "/admin"} />
        <label htmlFor="code">六位數驗證碼</label>
        <input id="code" name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoFocus />
        <p><button>驗證並繼續</button></p>
      </form>
    </>
  );
}
