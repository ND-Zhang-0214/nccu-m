/** @type {import('next').NextConfig} */
const nextConfig = {
  // 2026-08-31:原本列的是 better-sqlite3,但資料庫已換成 PostgreSQL,該套件早已移除,
  // 這裡留著一個不存在的套件名稱只會誤導後續維護者。改列 pg(node-postgres)——它內部有
  // 對選用套件 pg-native 的動態 require,交給打包器處理容易出問題,列為外部套件較穩妥。
  // instrumentationHook:開啟 src/instrumentation.ts 的 register() 掛鉤(Next.js 14 此旗標
  // 預設關閉,需顯式開啟),server process 啟動時據此啟動定時排程(見 server/scheduler.ts)。
  experimental: { serverComponentsExternalPackages: ["pg"], instrumentationHook: true },

  // §4.1、§4.2:全站安全回應標頭。
  // 2026-08 修正:Content-Security-Policy 原本寫死在這裡(無 nonce/unsafe-inline),
  // 但 Next.js App Router 的 streaming RSC 一定要注入 inline <script> 做 hydration,
  // 靜態 CSP 擋掉那些 inline script 後,全站「use client」元件在真實瀏覽器下完全無法互動
  // (登入表單、各類申請表單皆然)——只用 curl -I 檢查標頭存在測不出這個問題,
  // 需要實際瀏覽器渲染才會現形。CSP 已改為 src/middleware.ts 派發 per-request nonce,
  // 這裡不再重複設定,避免兩份 CSP 疊加造成瀏覽器取交集、nonce 版本反而被無 nonce 版本卡住。
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};
export default nextConfig;
