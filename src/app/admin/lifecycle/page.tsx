// 帳號生命週期管理(見 src/server/repositories/lifecycle.ts 檔頭關於偵測/排程的誠實範圍說明)
import { requireAdmin } from "@/server/authz";
import { listUsersInBuffer, listPendingRelinquishments } from "@/server/repositories/lifecycle";
import { getLatestAuditLogByAction } from "@/server/repositories/audit";
import {
  markGraduationAction, runLifecycleBatchAction, suspendAccountAction,
  restoreAccountAction, archiveAccountAction, initiateRelinquishmentAction, cancelRelinquishmentAction,
} from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function LifecyclePage() {
  await requireAdmin("/admin/lifecycle");
  const [inBuffer, relinquishments, lastRun] = await Promise.all([
    listUsersInBuffer(), listPendingRelinquishments(), getLatestAuditLogByAction("lifecycle.batch_run"),
  ]);
  let lastRunMeta: Record<string, unknown> = {};
  try { lastRunMeta = lastRun ? JSON.parse(lastRun.meta) : {}; } catch { /* 忽略壞資料 */ }

  return (
    <>
      <h1>帳號生命週期</h1>
      <p className="lede">
        偵測離校目前為管理員手動觸發(正式環境應接教務處 API 或信箱退信偵測),轉換邏輯本身是真實運作的。
      </p>
      <p className="lede">
        批次到期處理(緩衝期到期轉校友 + 交接日到期關閉需求 + 群組檔案到期/提醒)已改為背景定時排程
        自動執行,預設每日凌晨 3 點(見 src/server/scheduler.ts,可用環境變數調整頻率)。
        下方按鈕保留作為「立即手動觸發一次」的補充功能,與排程呼叫的是同一支處理邏輯。
      </p>
      {lastRun ? (
        <div className="notice ok" style={{ fontSize: 13.5 }}>
          最近一次批次執行:{new Date(lastRun.createdAt).toLocaleString("zh-TW")}
          {" "}・觸發來源:{lastRun.actorId ? "管理員手動觸發" : "定時排程自動觸發"}
          {" "}・結果:{JSON.stringify(lastRunMeta)}
        </div>
      ) : (
        <div className="notice" style={{ fontSize: 13.5 }}>尚未執行過任何一次批次(定時排程會在下一個排定時間自動執行,或使用下方按鈕立即觸發一次)。</div>
      )}

      <form action={runLifecycleBatchAction}>
        <p><button>立即手動觸發一次批次(緩衝期到期轉校友 + 交接日到期關閉需求)</button></p>
      </form>

      <h2>手動觸發畢業偵測 / 帳號狀態變更</h2>
      <form className="stack" action={markGraduationAction}>
        <label htmlFor="email1">信箱</label>
        <input id="email1" name="email" required placeholder="student@g.nccu.edu.tw" />
        <p><button className="secondary">標記為「偵測到可能已離校」(進入 6 個月緩衝期)</button></p>
      </form>
      <form className="stack" action={suspendAccountAction} style={{ marginTop: 16 }}>
        <label htmlFor="email2">信箱</label>
        <input id="email2" name="email" required placeholder="student@g.nccu.edu.tw" />
        <label htmlFor="reason">原因(選填)</label>
        <input id="reason" name="reason" placeholder="例:休學一年" />
        <p><button className="secondary">設為暫停(休學)</button></p>
      </form>
      <form className="stack" action={restoreAccountAction} style={{ marginTop: 16 }}>
        <label htmlFor="email3">信箱</label>
        <input id="email3" name="email" required placeholder="student@g.nccu.edu.tw" />
        <p><button className="secondary">恢復為正常狀態(復學)</button></p>
      </form>
      <form className="stack" action={archiveAccountAction} style={{ marginTop: 16 }}>
        <label htmlFor="email4">信箱</label>
        <input id="email4" name="email" required placeholder="student@g.nccu.edu.tw" />
        <label htmlFor="reason2">原因(選填)</label>
        <input id="reason2" name="reason" placeholder="例:退學" />
        <p><button className="danger">設為封存(退學,唯讀且不可自行恢復)</button></p>
      </form>

      <h2>畢業緩衝期中的帳號({inBuffer.length})</h2>
      {inBuffer.length === 0 ? <p className="lede">目前沒有處於緩衝期的帳號。</p> : (
        <table className="plain">
          <thead><tr><th>信箱</th><th>緩衝期至</th></tr></thead>
          <tbody>
            {inBuffer.map((u) => (
              <tr key={u.id}><td>{u.email}</td><td>{u.lifecycleBufferEndsAt?.toLocaleDateString("zh-TW")}</td></tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>教授帳號交接(待生效:{relinquishments.length})</h2>
      <form className="stack" action={initiateRelinquishmentAction}>
        <label htmlFor="professorId">教授檔案 ID</label>
        <input id="professorId" name="professorId" required />
        <label htmlFor="days">幾天後生效(30–90)</label>
        <input id="days" name="days" type="number" min={30} max={90} defaultValue={30} required />
        <label htmlFor="reason3">原因(選填)</label>
        <input id="reason3" name="reason" placeholder="例:退休" />
        <p><button className="secondary">提出交接申請</button></p>
      </form>
      {relinquishments.length > 0 && (
        <table className="plain">
          <thead><tr><th>教授 ID</th><th>生效日</th><th>操作</th></tr></thead>
          <tbody>
            {relinquishments.map((r) => (
              <tr key={r.id}>
                <td>{r.professorId}</td>
                <td>{r.relinquishAt.toLocaleDateString("zh-TW")}</td>
                <td>
                  <form action={cancelRelinquishmentAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="danger">取消</button>
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
