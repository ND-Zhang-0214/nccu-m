// 管理員雙因素驗證(§2.5)
// ─────────────────────────────────────────────────────────────
// 種子(secret)以 crypto.ts 的 encryptField 加密存於 users.totpSecretEnc,絕不存明文。
import { authenticator } from "otplib";
import { encryptField, decryptField } from "@/server/crypto";

export function generateSecret(): string {
  return authenticator.generateSecret();
}

export function getOtpauthUrl(secret: string, email: string): string {
  return authenticator.keyuri(email, "NCCU研究媒合平台", secret);
}

export function encryptSecret(secret: string): string {
  return encryptField(secret);
}

export function verifyTotpCode(encryptedSecret: string, code: string): boolean {
  try {
    const secret = decryptField(encryptedSecret);
    return authenticator.check(code, secret);
  } catch {
    return false; // fail-closed:解密或驗證過程任何異常一律視為驗證失敗
  }
}
