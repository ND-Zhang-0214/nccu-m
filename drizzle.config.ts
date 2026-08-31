import { defineConfig } from "drizzle-kit";

// 2026-08 換資料庫:dialect 由 "sqlite" 改為 "postgresql"。dbCredentials.url 直接讀
// DATABASE_URL(本機開發與正式環境用同一份設定來源,見 .env.example)。
export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL || "" },
});
