// 惡意內容掃描(§6)
// ─────────────────────────────────────────────────────────────
// 正式環境替換點:應接上真正的防毒引擎(如自架 ClamAV,透過 clamd socket 掃描;
// 或雲端掃描 API)。本檔目前的實作是業界標準的 EICAR 測試字串偵測——
// EICAR 是所有主流防毒軟體公認的「測試用惡意檔案特徵」,任何正牌防毒引擎都會
// 對含有這段字串的檔案示警,因此拿它來驗證「掃描這一關真的有在擋東西」是有效、
// 可重現的測試方式,不是隨便寫假的偵測邏輯充數。但它終究只能偵測這一種已知特徵,
// 不能取代真正的防毒引擎偵測未知惡意程式碼的能力,上線前務必替換。
const EICAR_SIGNATURE = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

export type ScanResult = "clean" | "infected" | "error";

export async function scanBuffer(buf: Buffer): Promise<ScanResult> {
  try {
    // 只在檔案前 4KB 內找特徵,避免對大檔案做全文字串搜尋造成不必要的效能負擔
    const head = buf.subarray(0, 4096).toString("latin1");
    if (head.includes(EICAR_SIGNATURE)) return "infected";
    return "clean";
  } catch {
    return "error"; // fail-closed:掃描本身出錯時,由呼叫端視同不可信任處理,不預設 clean
  }
}
