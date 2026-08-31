// 2026-08 修正:CSP 改為 middleware 派發 per-request nonce(原本的 next.config.mjs 靜態 CSP
// 沒有 nonce/unsafe-inline,而 Next.js App Router 的 streaming RSC 一定會注入 inline
// <script> 做 hydration payload——這在真實瀏覽器下會被自家 CSP 擋下,導致所有 "use client"
// 元件完全無法互動(登入表單、申請表單等)。此問題只有實際用瀏覽器載入頁面才會現形,
// 光用 curl -I 檢查標頭是否存在(SECURITY_REVIEW.md 原本的驗證方式)測不出來,
// 本輪以 Playwright 實際跑過登入流程時才發現(詳見交付文件的「已知問題」章節)。
//
// 修正方式為 Next.js 官方文件建議的 nonce 模式:middleware 每個請求產生一次性 nonce,
// 寫入 CSP 的 script-src,Next.js 會自動把同一個 nonce 套用在它自己產生的 inline script 上。
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/server/session-cookie";

// 白皮書 2.11.4「登入門檻」:平台介紹、使用條款(亦承載隱私政策,已定案不另開頁面)、
// 登入頁本身,是唯一明列的公開範圍;「所有教授資料、需求內容、申請功能」一律需登入,
// 沒有「先給一小段預覽再要求登入」這種中間地帶——這裡改成全站預設關閉、白名單開放,
// 取代先前(舊註解稱「§3.2 分級曝光」,範圍與 2.11.4 已牴觸)在個別內容頁各自決定要
// 露出多少內容給未登入訪客的寫法,避免各頁面寫法不一致、漏掉某一頁。
// /verify-human、/directory-index 兩者不是「公開內容」,是反爬取機制本身(§3.4 人機驗證、
// §3.5 蜜罐)必須維持匿名可存取才能運作,才放進白名單,性質與前三者不同。
const PUBLIC_PAGE_PATHS = new Set([
  "/",                 // 平台介紹(白皮書 2.11.4 明列公開)——首頁依登入狀態另做內容分級,見 page.tsx
  "/login",            // 登入頁本身不可能要求先登入才能造訪
  "/terms",            // 使用條款(白皮書 2.11.4 明列公開;隱私政策已定案共用此頁,不另開)
  "/verify-human",     // §3.4 人機驗證挑戰頁,必須在「還沒被判定通過」前就能存取
  "/directory-index",  // §3.5 蜜罐路由,必須維持匿名可存取,否則爬蟲永遠不會觸發記錄
]);

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // §2.11.4 全站登入門檻,粗篩層:只檢查 session cookie 存不存在。middleware 跑在 Edge
  // runtime,pg 用到 Node.js 原生 TCP/TLS socket 無法在此查資料庫做真正的 session 驗證(是否過期、
  // 是否已被撤銷等)——那一層權威複查留給 src/server/authz.ts 的 requireUser(),兩層各司
  // 其職:這裡擋掉「連 cookie 都沒有」的大宗匿名流量,省下整頁渲染與資料庫查詢的成本;
  // requireUser() 擋掉「cookie 存在但已失效」這種只有查資料庫才知道的情況。
  if (!PUBLIC_PAGE_PATHS.has(pathname) && !pathname.startsWith("/api/")) {
    // /api/* 全部排除:登入流程本身(取得驗證碼、驗證)就是 /api/ 路由,不能被自己擋住;
    // 其餘 API 路由(檔案上傳、資料匯出一次性連結等)各自已有自己的授權判斷,部分甚至
    // 刻意設計成不需要 session(如 /api/export/[token] 以 token 本身作為憑證),不應該
    // 被這裡的粗篩規則覆蓋。
    const hasSession = !!request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!hasSession) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname + search);
      return NextResponse.redirect(loginUrl);
    }
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  // 2026-08 複查追加:`next dev` 的 webpack HMR 用 eval() 包裝模組碼(devtool: eval-source-map),
  // 沒有 unsafe-eval 會連「登入表單填完 email 按下取得驗證碼完全沒反應」都重現——用 Playwright
  // 實測抓到 pageerror「Refused to evaluate a string as JavaScript because 'unsafe-eval' is not
  // an allowed source」,整個 use client 元件在 npm run dev 下全部失效,不只是熱更新失靈。
  // 只在非 production 放寬,正式建置(next start / production)的 CSP 嚴格度完全不變。
  const isDev = process.env.NODE_ENV !== "production";

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'", // React/Next 內建樣式注入需要;不影響腳本執行防護
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com", // Turnstile widget(§3.4 正式接上後使用)
    "frame-ancestors 'none'", // 防點擊劫持,等同 X-Frame-Options: DENY
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // requireUser()(src/server/authz.ts)讀這個標頭組出「登入後跳回原頁」的 next 參數——
  // 和上面的 x-nonce 是同一套「middleware 轉發自訂請求標頭給伺服器端元件」的機制,
  // Next.js App Router 沒有提供在任意伺服器端函式內讀取目前網址的公開 API。
  requestHeaders.set("x-pathname", pathname + search);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // 排除靜態資源與圖片最佳化路徑,避免 middleware 對每個靜態檔請求都跑一次
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
