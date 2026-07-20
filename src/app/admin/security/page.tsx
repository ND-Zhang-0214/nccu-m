// §8 安全事件檢視(唯讀)+ §5.2 存證鏈完整性檢查入口
import { requireAdmin } from "@/server/authz";
import { listRecentSecurityEvents } from "@/server/repositories/security";
import { verifyAuditChain } from "@/server/repositories/audit";

export const dynamic = "force-dynamic";

const SEVERITY_LABEL: Record<string, string> = { low: "低", medium: "中", high: "高" };

export default async function SecurityEventsPage() {
  await requireAdmin("/admin/security");
  const [events, brokenAt] = await Promise.all([listRecentSecurityEvents(100), verifyAuditChain()]);

  return (
    <>
      <h1>安全事件</h1>
      <p className="lede">
        僅記錄異常/可疑行為(登入鎖定、列舉偵測、蜜罐觸發、授權拒絕等),
        不含任何明文機敏內容。一般業務操作紀錄請見稽核日誌(資料庫 audit_logs)。
      </p>

      <div className={`notice ${brokenAt ? "" : "ok"}`}>
        存證鏈完整性:{brokenAt ? `⚠ 於紀錄 ${brokenAt} 偵測到斷鏈,請立即調查` : "✓ 完整,未偵測到竄改"}
      </div>

      {events.length === 0 ? (
        <p className="lede">目前沒有安全事件紀錄。</p>
      ) : (
        <table className="plain">
          <thead><tr><th>時間</th><th>類型</th><th>嚴重度</th><th>來源</th><th>細節</th></tr></thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.createdAt).toLocaleString("zh-TW")}</td>
                <td>{e.type}</td>
                <td><span className={`status-pill ${e.severity === "high" ? "rejected" : e.severity === "medium" ? "interview_invited" : "pending"}`}>{SEVERITY_LABEL[e.severity]}</span></td>
                <td>{e.ip || "—"}</td>
                <td style={{ maxWidth: 320, fontSize: 12.5, fontFamily: "monospace" }}>{e.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
