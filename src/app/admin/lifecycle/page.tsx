// 帳號生命週期管理(見 src/server/repositories/lifecycle.ts 檔頭關於偵測/排程的誠實範圍說明)
import { requireAdmin } from "@/server/authz";
import { listUsersInBuffer, listPendingRelinquishments } from "@/server/repositories/lifecycle";
import {
  markGraduationAction, runLifecycleBatchAction, suspendAccountAction,
  restoreAccountAction, archiveAccountAction, initiateRelinquishmentAction, cancelRelinquishmentAction,
} from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function LifecyclePage() {
  await requireAdmin("/admin/lifecycle");
  const [inBuffer, relinquishments] = await Promise.all([listUsersInBuffer(), listPendingRelinquishments()]);

  return (
    <>
      <h1>帳號生命週期</h1>
      <p className="lede">
        偵測離校目前為管理員手動觸發(正式環境應接教務處 API 或信箱退信偵測);
        批次到期處理目前為手動按鈕觸發(正式環境應接排程器)。轉換邏輯本身是真實運作的。
      </p>

      <form action={runLifecycleBatchAction}>
        <p><button>執行今日生命週期批次(緩衝期到期轉校友 + 交接日到期關閉需求)</button></p>
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
