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

export function middleware(request: NextRequest) {
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
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // 排除靜態資源與圖片最佳化路徑,避免 middleware 對每個靜態檔請求都跑一次
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
