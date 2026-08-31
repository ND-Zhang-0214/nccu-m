// 2026-08 換資料庫紀錄:原本(SQLite)npm run db:reset 是 `rm -f dev.db`,直接刪檔重來。
// PostgreSQL 沒有「一個檔案」可以刪,對應的乾淨重來做法是把 public schema 整個
// drop 再重建(等同清空所有資料表與資料),效果與刪 SQLite 檔案相同。這裡刻意寫成
// 獨立小腳本(而非直接塞進 package.json 的 shell 指令),因為 DROP SCHEMA 需要真正
// 連上資料庫執行 SQL,不是單純的檔案系統操作,用 tsx 執行與 seed.ts 手法一致。
//
// 僅供本機開發使用。正式環境(Neon 上的正式資料庫)不應該執行這支腳本。
import { Pool } from "pg";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL 未設定,無法重置資料庫。");
    process.exit(1);
  }
  const pool = new Pool({ connectionString, max: 1 });
  console.log("→ 清空 public schema …");
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  // drizzle-kit 把「哪些 migration 檔已套用」的紀錄存在獨立的 drizzle schema
  // (drizzle.__drizzle_migrations),不在 public 底下,DROP SCHEMA public 不會動到它。
  // 若不一併清掉,drizzle-kit 會誤以為所有 migration 都已套用過而整批跳過,
  // 實際上 public 已經被清空——等於資料表永遠不會被重建。這裡一併清掉才是真正的重來。
  console.log("→ 清空 drizzle 遷移紀錄 schema …");
  await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE;");
  await pool.end();
  console.log("→ 完成。接下來會執行 migrate + seed。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
