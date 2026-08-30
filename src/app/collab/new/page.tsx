import Link from "next/link";
import { requireUser } from "@/server/authz";
import { CreateCollabPostingForm } from "./create-collab-posting-form";

export const dynamic = "force-dynamic";

export default async function NewCollabPostingPage() {
  const user = await requireUser();
  if (user.role === "UNIT") {
    return (
      <>
        <h1>發布合作邀集</h1>
        <div className="notice">單位帳號無法發布學生合作邀集(白皮書 2.5.2 權限範圍不含此項)。</div>
      </>
    );
  }

  return (
    <>
      <nav className="crumbs">
        <Link href="/collab">學生合作專區</Link>
        <span className="sep">/</span>
        <span>發布合作邀集</span>
      </nav>
      <h1>發布合作邀集</h1>
      <p className="lede">白皮書 2.6:學生對學生的合作邀集,發布後會依你選擇的類型自動歸入對應分區。</p>
      <CreateCollabPostingForm />
    </>
  );
}
