// 資料庫連線單例(PostgreSQL / node-postgres)。
// 2026-08 換資料庫:原為 better-sqlite3(本機檔案),改用標準 pg 連線池 + drizzle-orm/node-postgres。
// 選用理由(而非 Neon 專屬的 @neondatabase/serverless):
// 1. Vercel 上這支 app 是一般 Node.js Function(非 Edge runtime,見 instrumentation.ts 的
//    NEXT_RUNTIME==="nodejs" 判斷),原生支援 TCP 連線,不需要 Neon 的 fetch/WebSocket 驅動。
// 2. 標準 pg 對任何 PostgreSQL(Neon、本機、其他雲端代管)都通用,換供應商不需換程式碼。
// 3. Neon 提供「pooled connection string」(PgBouncer,主機名含 -pooler),部署文件已指定
//    DATABASE_URL 一律填 pooled 版本,搭配 pg.Pool 可在無伺服器環境下安全運作,不會把
//    Neon/Postgres 的連線數上限用盡(見部署教學文件)。
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { db?: ReturnType<typeof create>; pgPool?: Pool };

function create() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL 未設定。本機開發請複製 .env.example 為 .env 並填入 PostgreSQL 連線字串。");
  }
  const pool =
    globalForDb.pgPool ??
    new Pool({
      connectionString,
      // 免費方案(如 Neon)常見連線數上限較低,加上無伺服器環境可能同時有多個函式實例,
      // 這裡刻意把單一 Pool 的連線數壓低,搭配 DATABASE_URL 建議使用 pooled 連線字串雙重保險。
      max: 5,
      ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
        ? false
        : { rejectUnauthorized: false },
    });
  if (process.env.NODE_ENV !== "production") globalForDb.pgPool = pool;
  return drizzle(pool, { schema });
}

export const db = globalForDb.db ?? create();
if (process.env.NODE_ENV !== "production") globalForDb.db = db;
