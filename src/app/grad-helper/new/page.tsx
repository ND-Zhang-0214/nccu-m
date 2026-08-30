import Link from "next/link";
import { requireUser } from "@/server/authz";
import { canCreateGradHelperPosting } from "@/server/repositories/users";
import { CreateGradHelperPostingForm } from "./create-grad-helper-posting-form";

export const dynamic = "force-dynamic";

export default async function NewGradHelperPostingPage() {
  const user = await requireUser();

  if (!canCreateGradHelperPosting(user)) {
    return (
      <>
        <h1>發布需求找幫手</h1>
        <div className="notice">
          此功能限碩士/博士生使用,且需先經教授確認學制。請先到
          {" "}<Link href="/me/settings">個人設定</Link> 填寫學制為碩士或博士,
          再請任一位教授到教授儀表板為你確認。
        </div>
      </>
    );
  }

  return (
    <>
      <nav className="crumbs">
        <Link href="/postings">開放需求</Link>
        <span className="sep">/</span>
        <span>發布需求找幫手</span>
      </nav>
      <h1>發布需求找幫手</h1>
      <p className="lede">
        白皮書 2.4.1:碩博生自身即有人力需求(資料整理、文獻回顧、實驗協助、訪談逐字稿等),
        可自行發布需求找大學部學生協助,不需要教授核准,所屬指導教授僅作為課責對象。
      </p>
      <CreateGradHelperPostingForm />
    </>
  );
}
