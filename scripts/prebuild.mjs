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

if (!process.env.DATABASE_URL) {
  console.error(
    "\n[prebuild] 建置環境讀不到 DATABASE_URL。\n" +
      "請到 Vercel 專案 → Settings → Environment Variables 確認:\n" +
      "  1. 變數名稱正是 DATABASE_URL(全大寫、沒有多餘空白)\n" +
      "  2. 有勾選這次部署所屬的環境(Production / Preview 都建議勾)\n" +
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
