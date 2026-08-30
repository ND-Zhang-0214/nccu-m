// session cookie 的名稱獨立成這支極小檔案,理由見 src/server/auth.ts 頂端的對應註解:
// middleware.ts 跑在 Edge runtime,不能 import 到 auth.ts(它會連帶引入 db client,
// db client 底層的 better-sqlite3 是原生 Node 模組,Edge runtime 打包會直接失敗)。
// 這支檔案不 import 任何 db/Node-only 依賴,兩邊都能安全 import,避免各自硬寫一份
// 字串常數而在日後修改時漂移不同步。
export const SESSION_COOKIE_NAME = "rm_session";
