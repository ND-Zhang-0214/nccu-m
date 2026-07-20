/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 為原生模組,需列為外部套件
  experimental: { serverComponentsExternalPackages: ["better-sqlite3"] },

  // §4.1、§4.2:全站安全回應標頭與內容安全政策(CSP)
  // CSP 未使用 nonce:App Router 預設不注入內聯腳本(hydration 由框架處理,非 inline handler),
  // 若未來加入第三方 inline script(如 Turnstile widget),屆時改用 middleware 派發 per-request nonce。
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' https://challenges.cloudflare.com",
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

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
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
