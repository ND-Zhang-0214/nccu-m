// 2026-08 新增:正式環境的驗證碼寄信服務。
// ─────────────────────────────────────────────────────────────
// 背景:auth.ts 的 issueCode() 原本就寫明「正式環境:在此改為呼叫寄信服務,絕不回傳 code」
// ——這是換資料庫/託管時才真正碰到的缺口:平台部署上線後,示範一鍵登入在 NODE_ENV=
// production 會自動關閉(設計如此,正式站不該留後門),而正式的 email 驗證碼流程若沒有
//真的寄出信件,使用者就完全無法登入,等於平台部署了但沒有人進得去。
//
// 選用 Resend:免費方案不需信用卡、每日 100 封/每月 3,000 封,對一個學校社團規模的
// 平台綽綽有餘(若真的成長到超過這個量,屆時再評估升級或換方案,不在本次範圍內誠實
// 註記為已知限制)。採用官方 REST API 直接 fetch,不另外加裝 SDK 依賴——寄一封簡單的
// 交易型信件不需要完整 SDK 的功能。
//
// 設計:未設定 RESEND_API_KEY 時(本機開發預設狀態)sendVerificationCodeEmail 直接
// 回傳 { sent: false },呼叫端(auth.ts issueCode)不會因此拋錯——本機開發本來就是靠
// request-code 路由回傳的 devCode 測試,不需要真的寄信。
const RESEND_ENDPOINT = "https://api.resend.com/emails";

// 寄件地址:優先使用管理員在 Resend 驗證過的自訂網域(EMAIL_FROM,格式如
// "政大研究媒合平台 <noreply@your-domain.com>");若尚未驗證網域,可先用 Resend
// 提供的 onboarding@resend.dev 測試寄件位址(見部署教學文件),兩者 API 呼叫方式相同。
function fromAddress(): string {
  return process.env.EMAIL_FROM || "onboarding@resend.dev";
}

/** 信件內文若要附連結,需要完整網址(相對路徑在信箱裡沒有意義)。優先採手動設定的
 *  APP_BASE_URL(換自訂網域後應該設定);未設定時退回 Vercel 自動注入的 VERCEL_URL
 *  (該部署自己的網域,不需要另外設定就能動作);本機開發兩者都沒有則回傳空字串,
 *  呼叫端組出的連結會是相對路徑,對本機開發/以 devCode 測試沒有影響。 */
export function appBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "";
}

/** 低階寄信函式:未設定 RESEND_API_KEY 時直接回傳 { sent: false },不拋錯——
 *  呼叫端(auth.ts issueCode、lifecycle.ts 的到期提醒/畢業匯出通知)一律把「沒寄成功」
 *  當成非致命狀況處理,不能因為信件寄送失敗就讓登入或批次作業整個中斷。 */
export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  html?: string,
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) return { sent: false };

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromAddress(), to: [to], subject, text, html: html || undefined }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[email] Resend 回傳非 2xx:${res.status} ${body}`);
      return { sent: false, error: `resend_${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    // fail-closed 的另一面:寄信失敗不能讓呼叫端整個掛掉,但要留下完整錯誤方便
    // 事後查證,不悄悄吞掉。
    console.error("[email] 寄送信件失敗", e);
    return { sent: false, error: "network_error" };
  }
}

export async function sendVerificationCodeEmail(
  email: string,
  code: string,
): Promise<{ sent: boolean; error?: string }> {
  return sendEmail(
    email,
    `【政大研究媒合平台】登入驗證碼:${code}`,
    `您的登入驗證碼是:${code}\n\n此驗證碼 10 分鐘內有效,若非您本人操作請忽略此信。`,
    `<p>您的登入驗證碼是:<strong style="font-size:20px">${code}</strong></p><p>此驗證碼 10 分鐘內有效,若非您本人操作請忽略此信。</p>`,
  );
}
