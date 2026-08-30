// Next.js 官方的 instrumentation hook:server process 啟動時執行一次(需在 next.config.mjs
// 開啟 experimental.instrumentationHook)。這裡用它來啟動定時排程(見 server/scheduler.ts),
// 取代先前「只能在 /admin/lifecycle 頁面手動按按鈕」的批次觸發方式(對應任務:定時排程
// 取代手動觸發)。
export async function register() {
  // 只在 Node.js runtime 執行:Next.js 也會為 Edge runtime 執行一次 instrumentation,
  // 但排程邏輯依賴 node-cron 與最終底層的 better-sqlite3(原生 Node 模組),
  // 在 Edge runtime 會直接打包失敗——與 middleware.ts 不能 import db client 是同一個限制。
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startLifecycleScheduler } = await import("@/server/scheduler");
    startLifecycleScheduler();
  }
}
