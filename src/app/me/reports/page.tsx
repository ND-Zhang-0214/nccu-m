// 對應決策表 #11:檢舉進度可視化,取代「送出後石沉大海」。
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth";
import { listReportsByUser } from "@/server/repositories/audit";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { open: "受理中", resolved: "已結案(成立)", dismissed: "已結案(不成立)" };

export default async function MyReportsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const reports = await listReportsByUser(user.id);

  return (
    <>
      <h1>我的檢舉</h1>
      <p className="lede">安全疑慮案件 48 小時內初步處理,一般案件 7 日內。</p>
      {reports.length === 0 ? (
        <p className="lede">你還沒有送出過檢舉。</p>
      ) : (
        <table className="plain">
          <thead><tr><th>對象</th><th>理由</th><th>送出時間</th><th>狀態</th></tr></thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td>{r.targetType}</td>
                <td style={{ maxWidth: 320 }}>{r.reason}</td>
                <td>{new Date(r.createdAt).toLocaleDateString("zh-TW")}</td>
                <td>
                  <span className={`status-pill ${r.status === "open" ? "pending" : r.status === "resolved" ? "accepted" : "rejected"}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
