// 對稱加密工具(§5.1 敏感欄位靜態加密、§5.3 金鑰管理)
// ─────────────────────────────────────────────────────────────
// 金鑰來源:環境變數 ENCRYPTION_KEY(32 bytes,以 base64 表示;產生方式見 .env.example)。
// 絕不寫死於程式碼、絕不進版本庫。正式環境建議改由雲端 KMS 簽發/輪替,
// 本模組的 getKey() 是唯一需要替換的接點,呼叫端(repositories)不需改動。
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const b64 = process.env.ENCRYPTION_KEY;
  if (!b64) {
    // 開發環境降級:由 SESSION_SECRET 派生一把用途分離的金鑰,避免本機開發卡在缺金鑰。
    // 正式環境務必設定獨立的 ENCRYPTION_KEY,不得依賴此路徑(見 README 上線清單)。
    const fallback = process.env.SESSION_SECRET || "dev-only-insecure";
    return createHash("sha256").update(`enc:${fallback}`).digest();
  }
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY 必須是 32 bytes(base64 編碼)");
  return key;
}

/** 加密任意字串,回傳可安全存入資料庫的單一字串(iv/authTag/密文以 base64 拼接)。 */
export function encryptField(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), enc.toString("base64")].join(".");
}

/** 解密 encryptField 產生的字串;若格式或驗證失敗一律拋錯(fail-closed,不回傳猜測值)。 */
export function decryptField(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("加密欄位格式錯誤");
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return dec.toString("utf8");
}

/** 雜湊鏈用:計算「前一筆 hash + 本筆內容」的 SHA-256,任何竄改都會導致後續鏈斷裂。 */
export function chainHash(prevHash: string, content: Record<string, unknown>): string {
  return createHash("sha256").update(prevHash + JSON.stringify(content)).digest("hex");
}
