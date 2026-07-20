import Link from "next/link";
import { listPendingProfessors } from "@/server/repositories/professors";
import { listOpenReports } from "@/server/repositories/audit";
import { verifyProfessorAction, resolveReportAction } from "@/app/actions";
import { requireAdmin } from "@/server/authz";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin("/admin"); // §2.5:未啟用/逾時 2FA 會被導去設定或重驗
  const [pending, reports] = await Promise.all([listPendingProfessors(), listOpenReports()]);

  return (
    <>
      <h1>管理後台</h1>
      <p className="lede">
        所有管理操作(核准、駁回、結案)皆寫入不可刪除之稽核紀錄。
        {" "}<Link href="/admin/security">查看安全事件 →</Link>
        {" "}<Link href="/admin/approvals">敏感調閱雙人核可 →</Link>
        {" "}<Link href="/admin/lifecycle">帳號生命週期 →</Link>
        {" "}<Link href="/admin/semester-report">學期聚合報告 →</Link>
      </p>

      <h2>待審核教授帳號({pending.length})</h2>
      {pending.length === 0 ? <p className="lede">目前沒有待審核的教授帳號。</p> : (
        <table className="plain">
          <thead><tr><th>姓名</th><th>職稱</th><th>操作</th></tr></thead>
          <tbody>
            {pending.map((p) => (
              <tr key={p.id}>
                <td>{p.displayName}</td>
                <td>{p.title}</td>
                <td>
                  <form action={verifyProfessorAction} style={{ display: "inline" }}>
                    <input type="hidden" name="id" value={p.id} />
                    <button name="decision" value="APPROVED">核准</button>{" "}
                    <button className="danger" name="decision" value="REJECTED">駁回</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>未結案檢舉({reports.length})</h2>
      {reports.length === 0 ? <p className="lede">目前沒有未結案的檢舉。</p> : (
        <table className="plain">
          <thead><tr><th>對象</th><th>理由</th><th>時間</th><th>處理</th></tr></thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td>{r.targetType}</td>
                <td style={{ maxWidth: 360 }}>{r.reason}</td>
                <td>{new Date(r.createdAt).toLocaleDateString("zh-TW")}</td>
                <td>
                  <form action={resolveReportAction} style={{ display: "inline" }}>
                    <input type="hidden" name="id" value={r.id} />
                    <button name="decision" value="resolved">成立</button>{" "}
                    <button className="secondary" name="decision" value="dismissed">不成立</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
