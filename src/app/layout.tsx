import "./globals.css";
import Link from "next/link";
import type { Metadata, Viewport } from "next";
import { currentUser } from "@/server/auth";
import { getProfessorByUserId } from "@/server/repositories/professors";
import { getUnitByUserId } from "@/server/repositories/units";
import { countUnread } from "@/server/repositories/notifications";
import { getPersona } from "@/server/persona";
import { switchPersonaAction } from "@/app/actions";
import { IntroAnimation } from "./intro-animation";

export const metadata: Metadata = {
  title: "政大研究媒合平台",
  description: "校內研究媒合基礎設施:讓研究需求與人才在可驗證身分的環境中對接。",
};

// 白皮書 2.11.1「除了網頁版還要有好的手機版體驗」(PWA 不做,見專案決策紀錄):
// 明確宣告 viewport,而不是依賴框架預設值,確保手機瀏覽器一律以裝置寬度渲染、
// 不會被誤判成桌面版縮放顯示。
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const prof = user ? await getProfessorByUserId(user.id) : null;
  const unit = user ? await getUnitByUserId(user.id) : null;
  const unread = user ? await countUnread(user.id) : 0;
  const persona = getPersona();

  return (
    <html lang="zh-Hant-TW">
      <body>
        <IntroAnimation />
        <header className="site-header">
          <div className="shell">
            <Link href="/" className="brand">
              政大研究媒合平台<small>示範環境・僅含假資料</small>
            </Link>
            <nav className="nav">
              {/* 決策表 #9:身分視角切換,只影響下面這排導覽連結顯示哪些捷徑,不影響實際權限 */}
              {prof && (
                <form action={switchPersonaAction} style={{ display: "inline-flex" }}>
                  <input type="hidden" name="back" value="/" />
                  <div className="persona-switch">
                    <button name="persona" value="STUDENT" className={persona === "STUDENT" ? "active" : ""}>學生視角</button>
                    <button name="persona" value="PROFESSOR" className={persona === "PROFESSOR" ? "active" : ""}>教授視角</button>
                  </div>
                </form>
              )}

              {unit ? (
                // 白皮書 2.5.2:單位帳號權限範圍僅「發布職缺、收取履歷、通知錄取結果」,
                // 不可瀏覽教授資料——導覽列比照教授視角的精簡作法,但連「依領域瀏覽」都不給,
                // 伺服器端也已在 blockUnitFromDirectory() 擋下直接輸入網址的情況。
                <>
                  <Link href="/unit/dashboard">單位儀表板</Link>
                  <Link href="/messages">訊息</Link>
                  <Link href="/me/settings">個人設定</Link>
                </>
              ) : persona === "PROFESSOR" && prof ? (
                <>
                  <Link href="/professor/dashboard">我的儀表板</Link>
                  <Link href="/browse">依領域瀏覽</Link>
                </>
              ) : (
                <>
                  <Link href="/browse">依領域瀏覽</Link>
                  <Link href="/postings">開放需求</Link>
                  <Link href="/collab">學生合作專區</Link>
                  {user && <Link href="/me/applications">我的申請</Link>}
                  {user && <Link href="/me/requests">我的請求</Link>}
                  {user && <Link href="/me/reports">我的檢舉</Link>}
                  {user && <Link href="/messages">訊息</Link>}
                  {user && <Link href="/groups">群組</Link>}
                  {user && <Link href="/me/contacts">我的聯絡方式</Link>}
                  {user && <Link href="/me/settings">個人設定</Link>}
                </>
              )}

              {user?.role === "ADMIN" && <Link href="/admin">管理後台</Link>}

              {user && (
                <Link href="/notifications" className="bell-wrap" aria-label="通知">
                  🔔{unread > 0 && <span className="bell-badge">{unread}</span>}
                </Link>
              )}

              {user ? (
                <span style={{ color: "var(--muted)" }}>{user.displayName}</span>
              ) : (
                <Link href="/login">登入</Link>
              )}
            </nav>
          </div>
        </header>
        <main className="shell">{children}</main>
        <footer className="site-footer">
          <div className="shell">
            本平台為校內研究媒合之前置溝通工具,不取代任何學校正式行政程序。目前所有教授與需求皆為示範假資料。
          </div>
        </footer>
      </body>
    </html>
  );
}
