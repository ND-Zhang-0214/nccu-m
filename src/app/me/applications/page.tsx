// 對應決策表 #11:申請進度可視化狀態列,取代「送出後就不知道進度」。
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth";
import { listMyApplications, CATEGORIES } from "@/server/repositories/postings";

export const dynamic = "force-dynamic";

const STEPS = ["pending", "interview_invited", "interviewed", "accepted"];
const STEP_LABELS: Record<string, string> = {
  pending: "待審核", interview_invited: "邀請面試", interviewed: "已面試", accepted: "通過",
};

function StatusTrack({ status }: { status: string }) {
  if (status === "rejected") {
    return (
      <>
        <div className="status-track">
          <div className="seg rejected-fill" /><div className="seg rejected-fill" />
          <div className="seg rejected-fill" /><div className="seg rejected-fill" />
        </div>
        <div className="status-track-labels"><span>已婉拒</span></div>
      </>
    );
  }
  const idx = STEPS.indexOf(status);
  return (
    <>
      <div className="status-track">
        {STEPS.map((s, i) => <div key={s} className={`seg ${i <= idx ? "filled" : ""}`} />)}
      </div>
      <div className="status-track-labels">
        {STEPS.map((s) => <span key={s}>{STEP_LABELS[s]}</span>)}
      </div>
    </>
  );
}

export default async function MyApplicationsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const applications = await listMyApplications(user.id);

  return (
    <>
      <h1>我的申請</h1>
      <p className="lede">共 {applications.length} 筆。狀態列即時反映教授端的審核進度。</p>
      {applications.length === 0 ? (
        <p className="lede">你還沒有送出任何申請。<Link href="/postings">瀏覽開放需求</Link></p>
      ) : (
        applications.map((a) => (
          <article key={a.id} className="prof-card">
            <h3>
              <Link href={`/postings/${a.postingId}`}>{a.posting.title}</Link>
              <span className="badge cat">{CATEGORIES[a.posting.category]}</span>
            </h3>
            <StatusTrack status={a.status} />
          </article>
        ))
      )}
    </>
  );
}
