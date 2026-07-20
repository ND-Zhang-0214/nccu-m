// 對應決策表 #10:新手引導清單(教授端)+ #9 身分視角切換的教授視角落地頁。
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth";
import { getProfessorByUserId, getProfessorOnboarding } from "@/server/repositories/professors";
import { listPostingsByProfessor, CATEGORIES } from "@/server/repositories/postings";
import { AiTagsWidget } from "./ai-tags-widget";

export const dynamic = "force-dynamic";

export default async function ProfessorDashboard() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const prof = await getProfessorByUserId(user.id);
  if (!prof) {
    return (
      <>
        <h1>教授儀表板</h1>
        <div className="notice">此帳號尚未連結教授檔案,無法使用教授儀表板。如果你是教授本人,請聯絡管理員完成帳號認領。</div>
      </>
    );
  }

  const onboarding = await getProfessorOnboarding(prof.id);
  const steps = [
    { done: onboarding.hasBio, label: "完成檔案簡介" },
    { done: onboarding.hasSpecialties, label: "設定研究專長標籤" },
    { done: onboarding.hasPosting, label: "發布第一則需求" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);

  const postings = await listPostingsByProfessor(prof.id);

  return (
    <>
      <h1>教授儀表板</h1>
      <p className="lede">{prof.displayName}・{prof.verifyStatus === "APPROVED" ? "已核准" : prof.verifyStatus}</p>

      {doneCount < steps.length && (
        <div className="onboarding-box">
          <strong>新手引導({doneCount}/{steps.length})</strong>
          <div className="progress-bar"><div className="progress-bar-fill" style={{ width: `${pct}%` }} /></div>
          <ul className="checklist">
            {steps.map((s) => (
              <li key={s.label} className={s.done ? "done" : ""}>
                <span className="check-icon">{s.done ? "✓" : ""}</span>
                <span className="label">{s.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2>研究專長標籤</h2>
      <p className="lede" style={{ fontSize: 13.5 }}>
        AI 依你的檔案簡介建議標籤,點擊後才會實際加入,不會自動套用。
      </p>
      <AiTagsWidget professorId={prof.id} />

      <p style={{ marginTop: 24 }}>
        <Link href="/groups">我的研究團隊群組 →</Link>
      </p>

      <h2>我發布的需求({postings.length})</h2>
      {postings.length === 0 ? (
        <p className="lede">還沒有發布任何需求。</p>
      ) : (
        <ul className="catalog">
          {postings.map((p) => (
            <li key={p.id}>
              <Link href={`/postings/${p.id}/applications`}>
                <span>{p.title}</span>
                <span className="badge cat">{CATEGORIES[p.category]}</span>
                <span className="count">{p.isOpen ? "開放中" : "已關閉"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
