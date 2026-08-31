# 舊 SQLite migration 歸檔(2026-08)

這個目錄是換資料庫前(SQLite,`drizzle-orm/sqlite-core`)的完整 migration 歷史(0000–0011),
保留下來純粹作為開發過程的紀錄,**不會**也**不應該**被套用到任何資料庫。

現行的 PostgreSQL migration 在專案根目錄的 `drizzle/`,由 `npx drizzle-kit generate`
根據換完資料庫後的 `src/server/db/schema.ts` 重新產生為一支合併後的初始 migration
(`0000_strange_scorpion.sql`),不是把這裡的檔案逐一轉譯過去——兩種資料庫的 SQL 方言
差異夠大(型別、時間戳記表示法、交易語意等),逐檔轉譯的風險遠高於直接從最終
schema 重新產生。
