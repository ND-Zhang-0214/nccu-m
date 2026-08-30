import Link from "next/link";
import { currentSession } from "@/server/auth";
import { requireUser } from "@/server/authz";
import { listMySessions, listHiddenUsers } from "@/server/repositories/users";
import { DEGREE_LEVEL_LABELS } from "@/shared/categories";
import { DisplayNameForm } from "./display-name-form";
import { setDegreeLevelAction, revokeSessionAction, unhideUserAction } from "@/app/actions";
import { DataExportButton } from "./data-export-button";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const session = await currentSession();
  const [sessions, hidden] = await Promise.all([listMySessions(user.id), listHiddenUsers(user.id)]);

  return (
    <>
      <h1>個人設定</h1>

      <h2>顯示名稱</h2>
      <p className="lede" style={{ fontSize: 13.5 }}>
        對外顯示的暱稱,可自行修改(修改會留下紀錄)。內部真實姓名不受影響,僅供稽核與檢舉查證使用。
      </p>
      <DisplayNameForm currentName={user.displayName} />

      <h2>學制標記</h2>
      <p className="lede" style={{ fontSize: 13.5 }}>
        自行填寫,預設標示「未驗證」。僅在你要以「碩博生自行發布需求找幫手」功能時才需要驗證(白皮書 2.2.3)。
      </p>
      <form action={setDegreeLevelAction} className="stack">
        <select name="degreeLevel" defaultValue={user.degreeLevel ?? ""}>
          <option value="" disabled>請選擇學制</option>
          {Object.entries(DEGREE_LEVEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <p><button className="secondary">更新學制標記</button></p>
      </form>
      {user.degreeLevel && (
        <p style={{ fontSize: 13 }}>
          目前:{DEGREE_LEVEL_LABELS[user.degreeLevel]}
          {user.degreeLevelVerifiedAt ? "(已由教授確認)" : "(未驗證)"}
        </p>
      )}
      {(user.degreeLevel === "MASTER" || user.degreeLevel === "PHD") && (
        <p className="lede" style={{ fontSize: 13.5 }}>
          {user.degreeLevelVerifiedAt ? (
            <>學制已確認,可以<Link href="/grad-helper/new">發布需求找幫手</Link>(白皮書 2.4.1)。</>
          ) : (
            <>學制尚未經教授確認,請任一位教授到教授儀表板為你確認後,才能使用<Link href="/grad-helper/new">發布需求找幫手</Link>功能。</>
          )}
        </p>
      )}

      <h2>登入裝置</h2>
      <p className="lede" style={{ fontSize: 13.5 }}>
        目前有效的登入紀錄。認不出的裝置可直接強制登出(白皮書 3.2.5)。
      </p>
      <table className="plain">
        <thead><tr><th>裝置/瀏覽器</th><th>建立位置</th><th>最後使用</th><th></th></tr></thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id}>
              <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.userAgent || "(未知裝置)"}{s.id === session?.id && <b> · 目前使用中</b>}
              </td>
              <td>{s.createdIp || "—"}</td>
              <td>{new Date(s.lastUsedAt).toLocaleString("zh-TW")}</td>
              <td>
                {s.id !== session?.id && (
                  <form action={revokeSessionAction}>
                    <input type="hidden" name="sessionId" value={s.id} />
                    <button className="danger" style={{ fontSize: 12 }}>強制登出</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>已隱藏的使用者</h2>
      <p className="lede" style={{ fontSize: 13.5 }}>
        採「靜音」而非「阻斷」:你看不到對方內容,對方不會收到通知也不知道被隱藏,但無法再對你發起新對話或群組邀請(白皮書 2.12.2)。
      </p>
      {hidden.length === 0 ? (
        <p className="lede" style={{ fontSize: 13.5 }}>目前沒有隱藏任何人。</p>
      ) : (
        <ul className="catalog">
          {hidden.map((h) => (
            <li key={h.id}>
              <span className="row">
                {h.hidden?.displayName ?? "(帳號已不存在)"}
                <form action={unhideUserAction} style={{ marginLeft: "auto" }}>
                  <input type="hidden" name="targetUserId" value={h.hiddenUserId} />
                  <button className="secondary" style={{ fontSize: 12 }}>取消隱藏</button>
                </form>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* 白皮書 2.13:資料匯出(簡化版)。唯讀帳號(校友/休學/封存)一樣可以使用此功能。 */}
      <h2>資料匯出</h2>
      <p className="lede" style={{ fontSize: 13.5 }}>
        隨時可下載自己的完整資料(申請、請求、對話紀錄等)。點擊後立即產生一次性下載連結並開始下載,連結 30 天內有效、使用一次後即失效。
        簡化版本:不含個別附件的二進位內容(僅列出檔名等中繼資料),如需附件本體請至各申請/群組頁面另行下載;也未實作以密碼另外保護匯出檔案(白皮書原文對此留有尚未決定的問號,詳見下一版白皮書討論)。
      </p>
      <DataExportButton />
    </>
  );
}
