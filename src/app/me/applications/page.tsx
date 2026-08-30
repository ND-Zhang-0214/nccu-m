// 對應決策表 #11:申請進度可視化狀態列,取代「送出後就不知道進度」。
import Link from "next/link";
import { requireUser } from "@/server/authz";
import { listMyApplications, CATEGORIES } from "@/server/repositories/postings";
import { listAttachmentsForApplication } from "@/server/repositories/attachments";
import { requestFileLinkAction } from "@/app/actions";
import { UploadWidget } from "./upload-widget";

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
  const user = await requireUser();
  const applications = await listMyApplications(user.id);

  return (
    <>
      <h1>我的申請</h1>
      <p className="lede">共 {applications.length} 筆。狀態列即時反映教授端的審核進度。</p>
      {applications.length === 0 ? (
        <p className="lede">你還沒有送出任何申請。<Link href="/postings">瀏覽開放需求</Link></p>
      ) : (
        applications.map((a) => (
          <ApplicationCard key={a.id} application={a} />
        ))
      )}
    </>
  );
}

async function ApplicationCard({ application: a }: { application: Awaited<ReturnType<typeof listMyApplications>>[number] }) {
  const attachments = await listAttachmentsForApplication(a.id);
  return (
    <article className="prof-card">
      <h3>
        <Link href={`/postings/${a.postingId}`}>{a.posting.title}</Link>
        <span className="badge cat">{CATEGORIES[a.posting.category]}</span>
      </h3>
      <StatusTrack status={a.status} />
      {attachments.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {attachments.map((att) => (
            <form key={att.id} action={requestFileLinkAction} style={{ display: "inline-block", marginRight: 8 }}>
              <input type="hidden" name="attachmentId" value={att.id} />
              <button className="secondary" style={{ fontSize: 12.5 }}>下載 {att.originalName || "附件"}</button>
            </form>
          ))}
        </div>
      )}
      <UploadWidget applicationId={a.id} />
    </article>
  );
}
