import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth";
import { getProfessorByUserId } from "@/server/repositories/professors";
import { CreatePostingForm } from "./create-posting-form";

export const dynamic = "force-dynamic";

export default async function NewPostingPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const prof = await getProfessorByUserId(user.id);
  if (!prof) {
    return (
      <>
        <h1>發布新需求</h1>
        <div className="notice">
          此帳號尚未連結教授檔案,無法發布需求。如果你是教授本人,請聯絡管理員完成帳號認領。
        </div>
      </>
    );
  }

  return (
    <>
      <nav className="crumbs">
        <Link href="/professor/dashboard">我的儀表板</Link>
        <span className="sep">/</span>
        <span>發布新需求</span>
      </nav>
      <h1>發布新需求</h1>
      <p className="lede">
        對應白皮書 2.1「事由 × 發起方」二維模型中「教授 → 學生」方向。
        大專生計畫、推薦信改為學生主動發起,不在此發布,見「可受理的學生請求」設定;
        系辦短期與校內工讀改由單位帳號發布,見白皮書 2.5(單位帳號登入後另有專屬發布入口)。
      </p>
      <CreatePostingForm />
    </>
  );
}
