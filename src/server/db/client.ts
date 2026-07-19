// 資料庫連線單例。換 PostgreSQL 時:改用 drizzle-orm/node-postgres 並讀 DATABASE_URL。
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { db?: ReturnType<typeof create> };

function create() {
  const sqlite = new Database(process.env.DATABASE_URL?.replace("file:", "") || "dev.db");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

export const db = globalForDb.db ?? create();
if (process.env.NODE_ENV !== "production") globalForDb.db = db;
