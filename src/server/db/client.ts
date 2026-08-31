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

type Db = ReturnType<typeof create>;
const globalForDb = globalThis as unknown as { db?: Db; pgPool?: Pool };

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

// ── 延遲建立(lazy):不可以在模組載入當下就連資料庫 ──────────────────────
// 2026-08-31 修正(部署 Vercel 時實際踩到):原本這裡是
//     export const db = globalForDb.db ?? create();
// 也就是「只要有人 import 這個檔案,就立刻執行 create()」。create() 在缺少
// DATABASE_URL 時會 throw——而 next build 的「Collecting page data」階段會把每一支
// route 模組都 import 一次(為了讀取 route 的設定,例如 dynamic/revalidate),
// 於是建置階段就直接炸掉,錯誤訊息是「Failed to collect page data for /api/...」。
//
// 附帶說明:在 route 檔案加上 export const dynamic = "force-dynamic" 並不能解決這個問題
// ——Next.js 正是要 import 模組才讀得到那個 export,模組頂層的 throw 照樣會發生
// (實測驗證過:加了之後錯誤只是從 request-code 移到下一支 verify)。
//
// 正確做法是讓 db 變成「用到才建立」:以 Proxy 包一層,任何屬性存取(db.select、
// db.insert、db.transaction……)才觸發 create()。這樣 import 永遠不會有副作用,
// 建置階段安全,實際處理請求時才會真的連線。呼叫端一行都不用改。
let instance: Db | undefined;

function getDb(): Db {
  if (!instance) {
    instance = globalForDb.db ?? create();
    // 開發模式下 Next.js 會 hot reload,存到 globalThis 避免每次改檔案都新開一個連線池。
    if (process.env.NODE_ENV !== "production") globalForDb.db = instance;
  }
  return instance;
}

export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(real, prop, receiver);
    // 方法要綁回真正的 db 實例,否則 drizzle 內部的 this 會指到 Proxy。
    return typeof value === "function" ? value.bind(real) : value;
  },
  has(_target, prop) {
    return Reflect.has(getDb() as unknown as object, prop);
  },
});
