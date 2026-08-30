// 白皮書 2.9/2.10:學生發起請求的進度可視化,比照「我的申請」(決策表 #11)的設計精神。
import Link from "next/link";
import { requireUser } from "@/server/authz";
import { listMyStudentRequests } from "@/server/repositories/student-requests";
import { REQUEST_TYPES, REQUEST_STATUS_LABELS } from "@/shared/categories";

export const dynamic = "force-dynamic";

const FIELD_LABELS: Record<string, string> = {
  purpose: "推薦信目的", deadline: "截止日", subject: "請求信主旨", proposal: "研究構想",
  motivation: "動機與背景", availability: "可投入時間", projectName: "計畫名稱", sponsor: "計畫來源/單位", detail: "說明",
};

export default async function MyRequestsPage() {
  const user = await requireUser();
  const requests = await listMyStudentRequests(user.id);

  return (
    <>
      <h1>我的請求</h1>
      <p className="lede">共 {requests.length} 筆。包含推薦信、大專生計畫等你主動向教授提出的請求。</p>
      {requests.length === 0 ? (
        <p className="lede">你還沒有送出任何請求。到教授頁面查看可提出的請求項目。</p>
      ) : (
        requests.map((r) => {
          let payload: Record<string, string> = {};
          try { payload = JSON.parse(r.payload); } catch { /* 忽略舊格式 */ }
          return (
            <article key={r.id} className="request-card">
              <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>
                <Link href={`/professors/${r.professorId}`}>{r.professor.displayName}</Link>
                <span className="badge cat" style={{ marginLeft: 8 }}>{REQUEST_TYPES[r.type]}</span>
              </h3>
              <div className="meta">
                {new Date(r.createdAt).toLocaleDateString("zh-TW")}・
                <span className={`status-pill ${r.status}`}>{REQUEST_STATUS_LABELS[r.status] ?? r.status}</span>
              </div>
              {Object.entries(payload).filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="field" style={{ fontSize: 13.5, marginBottom: 6, whiteSpace: "pre-wrap" }}>
                  <b style={{ display: "block", color: "var(--muted)", fontWeight: 500, fontSize: 12 }}>{FIELD_LABELS[k] ?? k}</b>{v}
                </div>
              ))}
            </article>
          );
        })
      )}
    </>
  );
}
