// 定時排程:取代 /admin/lifecycle 原本「只能手動按按鈕」的批次觸發方式(對應白皮書
// 「批次到期處理應由排程器定期呼叫」的既有誠實標註,見 lifecycle.ts 檔頭)。
// 用 node-cron(純 npm 套件,免費、不依賴任何付費排程服務,符合「不准開啟會花錢的功能」
// 的限制)在 Next.js server process 內跑一個 in-process 排程,取代外部 cron 基礎設施。
//
// 已知簡化(誠實標註):
// - in-process 排程綁在單一 Node.js process 的生命週期上——process 重啟(部署、當機
//   重啟)期間排程會中斷,重啟後從下一個排定時間重新開始,不會「補跑」錯過的那一次。
//   正式環境若有多台伺服器水平擴展,每一台都會各自跑一份排程,需要額外加鎖或改用
//   外部排程服務(Vercel Cron / GitHub Actions scheduled workflow 等)避免重複執行——
//   這裡是單一 process 的示範環境,暫不處理多機重複執行的問題,誠實留待下一版評估。
// - 「偵測離校」本身(markGraduationDetected)不在這支排程處理範圍內,原因見
//   lifecycle.ts 檔頭:需要真實的教務處/信箱系統才能自動偵測,這裡仍為管理員手動觸發。
//   本排程只接手「緩衝期到期轉校友」「群組檔案到期/到期提醒」等已經是真實轉換邏輯、
//   只差「誰來按開始鈕」的部分。
import cron from "node-cron";
import { processLifecycleTransitions } from "@/server/repositories/lifecycle";
import { audit } from "@/server/repositories/audit";

// 預設每天凌晨 3 點執行一次(離峰時段,對應「今日批次」的語意)。可用環境變數覆寫——
// 例如 present 展示時想在幾分鐘內就看到排程真的自動觸發,可設 LIFECYCLE_CRON_SCHEDULE=
// "*/2 * * * *"(每 2 分鐘)。這裡刻意不把展示用的短間隔寫成預設值:預設值必須反映
// 正式環境該有的合理頻率,展示需求透過環境變數明講出來,而不是偷換預設行為。
const DEFAULT_SCHEDULE = "0 3 * * *";

let started = false;

export function startLifecycleScheduler() {
  // 防重複註冊:instrumentation.ts 的 register() 依 Next.js 文件應該只會在 server
  // process 啟動時跑一次,但這裡仍加一道自己的保險,避免任何非預期的重複呼叫疊加出
  // 兩份排程、批次跑兩次。
  if (started) return;

  const schedule = process.env.LIFECYCLE_CRON_SCHEDULE || DEFAULT_SCHEDULE;
  if (!cron.validate(schedule)) {
    console.error(`[lifecycle-scheduler] 無效的 LIFECYCLE_CRON_SCHEDULE="${schedule}",排程未啟動。`);
    return;
  }
  started = true;

  cron.schedule(schedule, async () => {
    const startedAt = new Date();
    try {
      const result = await processLifecycleTransitions();
      console.log(`[lifecycle-scheduler] 批次執行完成 ${startedAt.toISOString()}`, result);
      // actorId 用 null 標示「系統排程觸發」,與手動按鈕觸發(runLifecycleBatchAction,
      // actorId 為該管理員)在稽核紀錄上可以區分來源,呼應 §5.2 存證鏈「誰做了什麼」的精神。
      await audit(null, "lifecycle.batch_run", "", "", { ...result, trigger: "scheduler" });
    } catch (e) {
      // fail-closed 的另一面:排程執行失敗不能讓整個 server process 掛掉,但也不能悄悄
      // 吞掉不留痕跡——印出完整錯誤,下次排定時間會再重試。
      console.error(`[lifecycle-scheduler] 批次執行失敗 ${startedAt.toISOString()}`, e);
    }
  });

  console.log(`[lifecycle-scheduler] 已啟動,排程:"${schedule}"`);
}
