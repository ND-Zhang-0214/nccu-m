import { redirect } from "next/navigation";
import { currentUser, hasSignedTerms } from "@/server/auth";
import { TERMS_TEXT, TERMS_VERSION } from "@/server/terms";
import { signTermsAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function TermsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const signed = await hasSignedTerms(user.id, TERMS_VERSION);
  return (
    <>
      <h1>服務條款</h1>
      <p className="lede">版本:{TERMS_VERSION}。簽署時系統將記錄帳號、版本、時間與來源位址,作為存證。</p>
      <div className="terms-box">{TERMS_TEXT}</div>
      {signed ? (
        <div className="notice ok">你已完成本版本條款簽署,可以直接申請開放需求。</div>
      ) : (
        <form action={signTermsAction}>
          <p><button>我已閱讀並同意本條款</button></p>
        </form>
      )}
    </>
  );
}
