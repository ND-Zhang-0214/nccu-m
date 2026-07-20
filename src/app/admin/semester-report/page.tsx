// 學期聚合統計報告(架構書:僅彙整數字,不含個資,分組樣本 <5 不呈現)
import { requireAdmin } from "@/server/authz";
import { computeSemesterStats } from "@/server/repositories/semester-report";
import { CATEGORIES } from "@/shared/categories";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending: "待審核", interview_invited: "已邀請面試", interviewed: "已完成面試",
  accepted: "審核通過", rejected: "婉拒", open: "受理中", resolved: "成立", dismissed: "不成立",
};

export default async function SemesterReportPage({ searchParams }: { searchParams: { start?: string; end?: string } }) {
  await requireAdmin("/admin/semester-report");
  const end = searchParams.end ? new Date(searchParams.end) : new Date();
  const start = searchParams.start ? new Date(searchParams.start) : new Date(end.getTime() - 180 * 86400_000);
  const stats = await computeSemesterStats(start, end);

  return (
    <>
      <h1>學期聚合統計報告</h1>
      <p className="lede">
        僅呈現彙整統計數字,不含任何可識別個人之內容。任何分組樣本數 &lt;5 依規則隱藏,
        不呈現實際數字。可提供予學生自治組織作課責監督之用。
      </p>

      <form className="stack" style={{ maxWidth: 400 }}>
        <label htmlFor="start">起始日</label>
        <input id="start" name="start" type="date" defaultValue={start.toISOString().slice(0, 10)} />
        <label htmlFor="end">結束日</label>
        <input id="end" name="end" type="date" defaultValue={end.toISOString().slice(0, 10)} />
        <p><button className="secondary">套用區間</button></p>
      </form>

      <h2>新增使用者</h2>
      <p>{stats.newUsers}</p>

      <h2>需求發布(依類別)</h2>
      <table className="plain">
        <thead><tr><th>類別</th><th>數量</th></tr></thead>
        <tbody>
          {stats.postingsByCategory.map((r) => (
            <tr key={r.category}><td>{CATEGORIES[r.category] ?? r.category}</td><td>{r.count}</td></tr>
          ))}
        </tbody>
      </table>

      <h2>申請總覽</h2>
      <p>總申請數:{stats.totalApplications} ・ 媒合成功率:{stats.matchSuccessRate}</p>
      <table className="plain">
        <thead><tr><th>狀態</th><th>數量</th></tr></thead>
        <tbody>
          {stats.applicationsByStatus.map((r) => (
            <tr key={r.status}><td>{STATUS_LABEL[r.status] ?? r.status}</td><td>{r.count}</td></tr>
          ))}
        </tbody>
      </table>

      <h2>檢舉處理</h2>
      <p>總檢舉數:{stats.totalReports} ・ 平均處理時效:{stats.avgResolutionHours}{typeof stats.avgResolutionHours === "number" ? " 小時" : ""}</p>
      <table className="plain">
        <thead><tr><th>狀態</th><th>數量</th></tr></thead>
        <tbody>
          {stats.reportsByStatus.map((r) => (
            <tr key={r.status}><td>{STATUS_LABEL[r.status] ?? r.status}</td><td>{r.count}</td></tr>
          ))}
        </tbody>
      </table>

      <h2>帳號生命週期異動</h2>
      {stats.lifecycleEvents.length === 0 ? <p className="lede">此區間無相關異動。</p> : (
        <table className="plain">
          <thead><tr><th>異動類型</th><th>次數</th></tr></thead>
          <tbody>
            {stats.lifecycleEvents.map((r) => (
              <tr key={r.action}><td>{r.action}</td><td>{r.count}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
