// 對應決策表 #6:教授端「並排比較多份申請」介面,取代逐一點開比對。
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getPosting, listApplicationsForPosting, CATEGORIES } from "@/server/repositories/postings";
import { currentUser } from "@/server/auth";
import { updateApplicationStatusAction, startConversationAction, requestFileLinkAction } from "@/app/actions";
import { listAttachmentsForApplication } from "@/server/repositories/attachments";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending: "待審核", interview_invited: "已邀請面試", interviewed: "已完成面試",
  accepted: "審核通過", rejected: "婉拒",
};

export default async function ApplicationsComparePage({ params }: { params: { id: string } }) {
  const posting = await getPosting(params.id);
  if (!posting) notFound();
  const user = await currentUser();
  if (!user) redirect("/login");
  const isOwner = posting.professor.userId === user.id;
  if (!isOwner && user.role !== "ADMIN") redirect("/");

  const applications = await listApplicationsForPosting(params.id);

  return (
    <>
      <nav className="crumbs">
        <Link href={`/postings/${posting.id}`}>{posting.title}</Link>
        <span className="sep">/</span>
        <span>比較申請</span>
      </nav>
      <h1>{posting.title}<span className="badge cat">{CATEGORIES[posting.category]}</span></h1>
      <p className="lede">共 {applications.length} 份申請,並排比較後可直接更新狀態。</p>

      {applications.length === 0 ? (
        <p className="lede">目前還沒有申請。</p>
      ) : (
        <div className="compare-grid">
          {applications.map((a) => <CompareCard key={a.id} a={a} />)}
        </div>
      )}
    </>
  );
}

async function CompareCard({ a }: { a: Awaited<ReturnType<typeof listApplicationsForPosting>>[number] }) {
  let extra: { background?: string; availability?: string; categoryNote?: string } = {};
  try { extra = JSON.parse(a.payload); } catch { /* 忽略舊格式 */ }
  const attachments = await listAttachmentsForApplication(a.id);

  return (
    <article className="compare-card">
      <h3>{a.applicant.displayName}</h3>
      <div className="meta">
        {new Date(a.createdAt).toLocaleDateString("zh-TW")}・
        <span className={`status-pill ${a.status}`}>{STATUS_LABEL[a.status]}</span>
      </div>
      {extra.background && (
        <div className="field"><b>相關背景與興趣</b>{extra.background}</div>
      )}
      {extra.availability && (
        <div className="field"><b>可投入時間與技能</b>{extra.availability}</div>
      )}
      {extra.categoryNote && (
        <div className="field"><b>補充資料</b>{extra.categoryNote}</div>
      )}
      {!extra.background && <div className="field">{a.motivation}</div>}

      {attachments.length > 0 && (
        <div className="field">
          <b>附件</b>
          {attachments.map((att) => (
            <form key={att.id} action={requestFileLinkAction} style={{ display: "inline-block", marginRight: 6 }}>
              <input type="hidden" name="attachmentId" value={att.id} />
              <button className="secondary" style={{ fontSize: 12 }}>下載 {att.originalName || "附件"}</button>
            </form>
          ))}
        </div>
      )}

      <div className="compare-actions">
        <form action={startConversationAction}>
          <input type="hidden" name="applicationId" value={a.id} />
          <button className="secondary">開始對話</button>
        </form>
        <form action={updateApplicationStatusAction}>
          <input type="hidden" name="applicationId" value={a.id} />
          <input type="hidden" name="status" value="interview_invited" />
          <button className="secondary" disabled={a.status !== "pending"}>邀請面試</button>
        </form>
        <form action={updateApplicationStatusAction}>
          <input type="hidden" name="applicationId" value={a.id} />
          <input type="hidden" name="status" value="accepted" />
          <button disabled={a.status === "accepted" || a.status === "rejected"}>通過</button>
        </form>
        <form action={updateApplicationStatusAction}>
          <input type="hidden" name="applicationId" value={a.id} />
          <input type="hidden" name="status" value="rejected" />
          <button className="danger" disabled={a.status === "accepted" || a.status === "rejected"}>婉拒</button>
        </form>
      </div>
    </article>
  );
}
