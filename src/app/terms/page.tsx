import Link from "next/link";
import { currentUser, hasSignedTerms, isSafeNextPath } from "@/server/auth";
import { TERMS_TEXT, TERMS_VERSION } from "@/server/terms";
import { signTermsAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function TermsPage({ searchParams }: { searchParams: { next?: string } }) {
  // 白皮書 2.11.4:使用條款(與隱私政策共用此頁,已定案不另開頁面)是明列的公開範圍,
  // 未登入也能瀏覽——先前這裡對匿名訪客一律 redirect("/login") 與 2.11.4 的白名單牴觸,
  // 一併修正:只有「簽署」這個動作本身還是需要登入(下方表單只在 user 存在時渲染)。
  const user = await currentUser();
  const signed = user ? await hasSignedTerms(user.id, TERMS_VERSION) : false;
  const next = isSafeNextPath(searchParams.next) ? searchParams.next : "";
  return (
    <>
      <h1>服務條款</h1>
      <p className="lede">版本:{TERMS_VERSION}。簽署時系統將記錄帳號、版本、時間與來源位址,作為存證。</p>
      <div className="terms-box">{TERMS_TEXT}</div>
      {!user ? (
        <div className="notice">
          瀏覽條款不需要登入;要送出簽署,請先<Link href="/login">以校內信箱登入</Link>。
        </div>
      ) : signed ? (
        <div className="notice ok">
          你已完成本版本條款簽署,可以直接申請開放需求。
          {next && <> <Link href={next}>繼續 →</Link></>}
        </div>
      ) : (
        <form action={signTermsAction}>
          <input type="hidden" name="next" value={next} />
          <p><button>我已閱讀並同意本條款</button></p>
        </form>
      )}
    </>
  );
}
