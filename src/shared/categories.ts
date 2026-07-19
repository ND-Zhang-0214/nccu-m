// 共用常數,故意不放在 src/server 底下:client component(如即時篩選列)也需要引用,
// 若放在 server/repositories 裡會把資料庫連線一併打包進瀏覽器端程式碼,導致建置失敗。
export const CATEGORIES: Record<string, string> = {
  TA: "課程助教", DEPT: "系辦短期", UR: "大專生計畫", REC: "推薦信", IND: "產學/跨域",
};
