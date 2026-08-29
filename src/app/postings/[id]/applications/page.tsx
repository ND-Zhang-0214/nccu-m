// 對應決策表 #6:教授端「並排比較多份申請」介面,取代逐一點開比對。
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getPosting, listApplicationsForPosting, CATEGORIES } from "@/server/repositories/postings";
import { currentUser } from "@/server/auth";
import { updateApplicationStatusAction, startConversationAction, requestFileLinkAction, createSlotsAction, summarizeApplicationAction, getIcsLinkAction } from "@/app/actions";
import { listAttachmentsForApplication } from "@/server/repositories/attachments";
import { listSlotsByProfessor } from "@/server/repositories/interviews";

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
  const isOwner = posting.posterUserId === user.id;
  if (!isOwner && user.role !== "ADMIN") redirect("/");

  const applications = await listApplicationsForPosting(params.id);
  // 面試時段預約(白皮書 2.3 教授端功能)僅適用教授發起的需求;單位工讀、學生合作專區
  // 走一般申請+站內訊息即可,沒有「面試時段」這個概念,故此區塊限教授發起的需求才顯示。
  const mySlots = posting.posterType === "PROFESSOR" && posting.professorId
    ? (await listSlotsByProfessor(posting.professorId)).filter((s) => s.postingId === params.id)
    : [];

  return (
    <>
      <nav className="crumbs">
        <Link href={`/postings/${posting.id}`}>{posting.title}</Link>
        <span className="sep">/</span>
        <span>比較申請</span>
      </nav>
      <h1>{posting.title}<span className="badge cat">{CATEGORIES[posting.category]}</span></h1>
      <p className="lede">共 {applications.length} 份申請,並排比較後可直接更新狀態。</p>

      {posting.posterType === "PROFESSOR" && (
      <details style={{ marginBottom: 24 }}>
        <summary style={{ cursor: "pointer" }}>面試時段管理({mySlots.length} 個時段)</summary>
        <div style={{ marginTop: 12 }}>
          <form className="stack" action={createSlotsAction}>
            <input type="hidden" name="postingId" value={params.id} />
            <label htmlFor="startAt">開始時間</label>
            <input id="startAt" name="startAt" type="datetime-local" required />
            <label htmlFor="endAt">結束時間</label>
            <input id="endAt" name="endAt" type="datetime-local" required />
            <label htmlFor="location">地點(僅預約後對申請人顯示)</label>
            <input id="location" name="location" placeholder="例:研究大樓 405 室" />
            <p><button className="secondary">開放此時段</button></p>
          </form>
          {mySlots.length > 0 && (
            <table className="plain">
              <thead><tr><th>時間</th><th>狀態</th></tr></thead>
              <tbody>
                {mySlots.map((s) => (
                  <tr key={s.id}>
                    <td>{new Date(s.startAt).toLocaleString("zh-TW")}</td>
                    <td>{s.isBooked ? "已預約" : "開放中"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <form action={getIcsLinkAction}><p><button className="secondary">取得行事曆訂閱連結</button></p></form>
        </div>
      </details>
      )}

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
      {a.motivationSummary && (
        <div className="field"><b>AI 摘要</b>{a.motivationSummary}</div>
      )}
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

      {!a.motivationSummary && (
        <form action={summarizeApplicationAction}>
          <input type="hidden" name="applicationId" value={a.id} />
          <button className="secondary" style={{ fontSize: 12 }}>產生 AI 摘要</button>
        </form>
      )}

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
