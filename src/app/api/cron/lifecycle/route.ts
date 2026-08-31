// 帳號生命週期批次:Vercel Cron 專用觸發端點(取代 scheduler.ts 的 in-process node-cron,
// 見 src/instrumentation.ts 檔頭說明——只有部署在 Vercel 時才會用到這支路由;本機開發或
// 未來自架伺服器仍是 instrumentation.ts 啟動的 in-process 排程在跑,行為不變)。
//
// 排程時間設定在 vercel.json(crons[].path 指向本路由),UTC 時間;白皮書原意「凌晨 3 點」
// 指台北時間(UTC+8),換算為 UTC 19:00(前一天)。Vercel Hobby 方案的 cron 只能精準到「每日
// 一次」,實際觸發時間可能在排定小時的 ±59 分鐘內,對「離峰批次」這種用途沒有實質影響。
//
// 安全性:Vercel 呼叫排程端點時,若專案有設定 CRON_SECRET 環境變數,會自動夾帶
// `Authorization: Bearer <CRON_SECRET>`。這裡驗證這個標頭,避免任何人只要猜到網址
// 就能任意觸發批次(批次本身雖然是冪等的資料轉換,但仍不應該對外開放隨意觸發)。
import { NextResponse } from "next/server";
import { processLifecycleTransitions } from "@/server/repositories/lifecycle";
import { audit } from "@/server/repositories/audit";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  try {
    const result = await processLifecycleTransitions();
    // actorId 用 null 標示「系統排程觸發」,與手動按鈕觸發(runLifecycleBatchAction,
    // actorId 為該管理員)在稽核紀錄上可以區分來源,呼應 §5.2 存證鏈「誰做了什麼」的精神。
    await audit(null, "lifecycle.batch_run", "", "", { ...result, trigger: "vercel-cron" });
    return NextResponse.json({ ok: true, startedAt: startedAt.toISOString(), result });
  } catch (e) {
    // fail-closed 的另一面:批次執行失敗要回傳非 200(Vercel Cron 才會在儀表板標示失敗),
    // 但不能悄悄吞掉不留痕跡——一樣印出完整錯誤,下次排定時間會再重試。
    console.error(`[lifecycle-cron] 批次執行失敗 ${startedAt.toISOString()}`, e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
