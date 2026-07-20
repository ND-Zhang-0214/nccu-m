// §2.5 雙人核可:管理員在此提出/核可敏感調閱申請。
// 目前唯一支援的調閱動作:查看某對話的訊息內容(conversation.view_messages)。
import { requireAdmin } from "@/server/authz";
import { listPendingForOthers, listMyRequests } from "@/server/repositories/dual-approval";
import { requestApprovalAction, decideApprovalAction } from "@/app/actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { pending: "待核可", approved: "已核可", rejected: "已駁回" };

export default async function ApprovalsPage() {
  const admin = await requireAdmin("/admin/approvals");
  const [pendingForOthers, mine] = await Promise.all([
    listPendingForOthers(admin.id),
    listMyRequests(admin.id),
  ]);

  return (
    <>
      <h1>敏感調閱雙人核可</h1>
      <p className="lede">
        調閱他人站內訊息內容前,需另一位管理員核可(不可自己核可自己的申請)。
        核可通過後,申請人有 30 分鐘的時效窗口可實際查看。
      </p>

      <h2>提出新的調閱申請</h2>
      <form className="stack" action={requestApprovalAction}>
        <input type="hidden" name="action" value="conversation.view_messages" />
        <input type="hidden" name="targetType" value="CONVERSATION" />
        <label htmlFor="targetId">對話 ID</label>
        <input id="targetId" name="targetId" required placeholder="從檢舉調查或使用者回報中取得" />
        <p><button>提出申請</button></p>
      </form>

      <h2>待你核可的申請({pendingForOthers.length})</h2>
      <p className="lede" style={{ fontSize: 13 }}>只顯示其他管理員提出的申請,你無法核可自己的申請。</p>
      {pendingForOthers.length === 0 ? (
        <p className="lede">目前沒有待核可的申請。</p>
      ) : (
        <table className="plain">
          <thead><tr><th>申請人</th><th>動作</th><th>對象</th><th>時間</th><th>處理</th></tr></thead>
          <tbody>
            {pendingForOthers.map((r) => (
              <tr key={r.id}>
                <td>{r.requesterId}</td>
                <td>{r.action}</td>
                <td>{r.targetType}:{r.targetId}</td>
                <td>{new Date(r.createdAt).toLocaleString("zh-TW")}</td>
                <td>
                  <form action={decideApprovalAction} style={{ display: "inline" }}>
                    <input type="hidden" name="id" value={r.id} />
                    <button name="decision" value="approved">核可</button>{" "}
                    <button className="danger" name="decision" value="rejected">駁回</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>我提出的申請({mine.length})</h2>
      {mine.length === 0 ? (
        <p className="lede">尚未提出過申請。</p>
      ) : (
        <table className="plain">
          <thead><tr><th>對象</th><th>狀態</th><th>時間</th><th>查看</th></tr></thead>
          <tbody>
            {mine.map((r) => (
              <tr key={r.id}>
                <td>{r.targetType}:{r.targetId}</td>
                <td><span className={`status-pill ${r.status === "approved" ? "accepted" : r.status === "pending" ? "pending" : "rejected"}`}>{STATUS_LABEL[r.status]}</span></td>
                <td>{new Date(r.createdAt).toLocaleString("zh-TW")}</td>
                <td>{r.status === "approved" && r.targetType === "CONVERSATION" && (
                  <a href={`/admin/conversations/${r.targetId}`}>前往查看 →</a>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
