// Next.js 官方的 instrumentation hook:server process 啟動時執行一次(需在 next.config.mjs
// 開啟 experimental.instrumentationHook)。這裡用它來啟動定時排程(見 server/scheduler.ts),
// 取代先前「只能在 /admin/lifecycle 頁面手動按按鈕」的批次觸發方式(對應任務:定時排程
// 取代手動觸發)。
//
// 2026-08 免費託管紀錄:in-process node-cron 需要一個「持續存活」的 server process 才有意義
// (見 scheduler.ts 檔頭原本就寫明的已知限制)。部署在 Vercel 這類無伺服器平台時,函式是
// 依請求啟動、閒置後就會被回收,不存在「持續存活的 process」,in-process 排程實務上不會
// 定期觸發。因此這裡改為偵測 process.env.VERCEL(Vercel 部署環境會自動設定此變數)——
// 部署在 Vercel 時完全不啟動 in-process 排程,改由 vercel.json 設定的 Vercel Cron 定期打
// /api/cron/lifecycle 觸發同一支批次函式(見該路由與 vercel.json 註解)。本機開發、或未來
// 若改自架伺服器(process.env.VERCEL 不存在),行為與換資料庫前完全一樣,不需要另外設定。
export async function register() {
  if (process.env.VERCEL) return;
  // 只在 Node.js runtime 執行:Next.js 也會為 Edge runtime 執行一次 instrumentation,
  // 但排程邏輯依賴 node-cron 與底層的 PostgreSQL 連線池,在 Edge runtime 會直接打包
  // 失敗——與 middleware.ts 不能 import db client 是同一個限制。
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startLifecycleScheduler } = await import("@/server/scheduler");
    startLifecycleScheduler();
  }
}
