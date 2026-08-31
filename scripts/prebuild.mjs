// 建置前置作業:在雲端部署時自動套用資料庫 migration。
// ─────────────────────────────────────────────────────────────
// 2026-08-31 修正:原本把這件事放在 package.json 的 "vercel-build" 腳本裡,
// 但實際部署時 Vercel 跑的是 "npm run build"(部署 log 顯示
// `Command "npm run build" exited with 1`),"vercel-build" 從未被執行,
// 結果就是程式碼上去了、資料表卻沒建立。
//
// 因此改成掛在 "build" 本身,再用環境變數判斷是否真的要跑:
//   - 在 Vercel 上(process.env.VERCEL 由平台自動設定)→ 執行 migration。
//   - 在自己電腦上 npm run build → 直接跳過,不會連資料庫,行為與以前相同。
// 這樣不論 Vercel 選擇執行哪一個腳本名稱,migration 都保證會跑到一次。
import { spawnSync } from "node:child_process";

if (!process.env.VERCEL) {
  console.log("[prebuild] 非 Vercel 環境,略過資料庫 migration。");
  process.exit(0);
}

// 2026-08-31 調整:只有「正式環境」缺 DATABASE_URL 才中止建置。
// 原因:GitHub 的 Dependabot 會自動開一堆升級套件的 PR,每個 PR 都會觸發一次 Preview
// 部署。Preview 環境通常沒設定資料庫變數(很多人只勾了 Production),原本一律中止的
// 寫法會讓 Vercel 清單瞬間多出一排紅色 Error——那些其實跟正式站台一點關係都沒有,
// 卻很容易讓人以為網站壞了。Preview 缺變數時改為「跳過 migration、照常建置」,
// 正式環境則維持嚴格中止(正式站沒有資料庫是絕對不能放行的)。
const isProduction = process.env.VERCEL_ENV === "production";

if (!process.env.DATABASE_URL) {
  if (!isProduction) {
    console.warn(
      `[prebuild] 這是 ${process.env.VERCEL_ENV || "非正式"} 環境且未設定 DATABASE_URL,` +
        "略過 migration 繼續建置(此環境不會有可用的資料庫,屬預期行為)。",
    );
    process.exit(0);
  }
  console.error(
    "\n[prebuild] 正式環境的建置讀不到 DATABASE_URL。\n" +
      "請到 Vercel 專案 → Settings → Environment Variables 確認:\n" +
      "  1. 變數名稱正是 DATABASE_URL(全大寫、沒有多餘空白)\n" +
      "  2. 有勾選 Production(建議連 Preview 一起勾)\n" +
      "  3. 值是 Neon 的 Pooled connection string(主機名稱含 -pooler)\n",
  );
  process.exit(1);
}

console.log("[prebuild] 套用資料庫 migration …");
const r = spawnSync("npx", ["drizzle-kit", "migrate"], { stdio: "inherit", shell: false });

if (r.status !== 0) {
  console.error(
    "\n[prebuild] migration 失敗,已中止建置。\n" +
      "這是刻意的:與其部署一個「網址打得開、但每一頁都因為找不到資料表而出錯」的站台,\n" +
      "不如在這裡就停下來。常見原因是 DATABASE_URL 內容有誤(多了空白、貼到 Direct 而非\n" +
      "Pooled 連線字串),或 Neon 專案尚未建立完成。\n",
  );
  process.exit(r.status ?? 1);
}

console.log("[prebuild] migration 完成。");
