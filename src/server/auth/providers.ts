// 白皮書 1.5/2.2.1「登入來源可抽換」:架構設計上已預留多校擴充(登入來源可抽換、
// 帳號帶學校標記),本檔是那個「可抽換」的實際介面。
//
// 目前只有一種提供者(MockEmailCodeProvider,即現行的六位數驗證碼流程),
// 因為 iNCCU 真實 SSO 需要校方確認機制與資安介接方式(白皮書第四章 4.2),
// 屬白皮書第三階段(依賴校方回覆),本輪不做真 SSO 本身——但把「取得一個已驗證的
// 校內信箱」這個動作抽成介面,是白皮書明文要求「可立即進行、不依賴校方」的第一階段項目。
//
// 之後若要接 iNCCU,只需要新寫一個 class 實作 IdentityProvider(如下方註解的
// INCCUSsoProvider 骨架),src/server/auth.ts 完全不用改,因為它只依賴這個介面,
// 不直接依賴 email 驗證碼的實作細節。

export interface ResolvedIdentity {
  email: string;
  provider: string; // 寫入 sessions.provider,供裝置清單/稽核辨識登入來源
}

export interface IdentityProvider {
  readonly id: string;
  /** 白皮書 2.2.1 步驟②③:取得並驗證一個校內信箱(此步驟通過後,系統才能依網域判定初始身分)。 */
  resolveIdentity(input: unknown): Promise<ResolvedIdentity | null>;
}

// ── 目前唯一的實作:mock email 驗證碼(現行流程,見 issueCode/verifyCodeAndLogin)──
// 這個 class 本身不重新實作驗證碼邏輯(避免兩套並存互相漂移),而是包一層介面,
// 讓 auth.ts 的 verifyCodeAndLogin 之後可以透過 identityProvider.id 記錄 session 來源。
export class MockEmailCodeProvider implements IdentityProvider {
  readonly id = "mock-email-code";
  async resolveIdentity(input: { email: string }): Promise<ResolvedIdentity | null> {
    // 實際的驗證碼比對邏輯留在 auth.ts(避免搬移雜湊/資料庫細節到這裡造成職責重疊),
    // 這裡只回傳「這次登入用的是哪個提供者」,呼叫端(verifyCodeAndLogin)已經先驗證過碼。
    return { email: input.email, provider: this.id };
  }
}

// ── 未來骨架(尚未實作,不匯出、不影響現行建置):────────────────────────
// export class INCCUSsoProvider implements IdentityProvider {
//   readonly id = "inccu-sso";
//   async resolveIdentity(input: { ssoAssertion: string }): Promise<ResolvedIdentity | null> {
//     // 1. 向 iNCCU 端點驗證 SSO assertion(白皮書 2.2.1 步驟①,待校方確認機制細節)
//     // 2. 取得 iNCCU 使用者識別碼與校內信箱(白皮書 2.2.1 設計理由:綁定主鍵應為
//     //    iNCCU 使用者識別碼而非信箱,此處簡化先回傳 email,真正介接時需調整
//     //    users 表以識別碼為主鍵關聯,見 schema.ts 換資料庫指南同一段精神)
//     // 3. 回傳 { email, provider: this.id }
//     throw new Error("尚未實作,待白皮書第四章校方確認事項回覆後接上");
//   }
// }

export function getActiveIdentityProvider(): IdentityProvider {
  return new MockEmailCodeProvider();
}
