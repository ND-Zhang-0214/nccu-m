// AI 輔助(架構書 M9:研究標籤建議、申請動機摘要)
// ─────────────────────────────────────────────────────────────
// 這是真的整合,不是假接口:設定 ANTHROPIC_API_KEY 後會真的呼叫 Claude API;
// 沒設定金鑰時(本開發環境預設狀態),退回一套確定性的關鍵字比對啟發式演算法,
// 讓功能在沒有金鑰的情況下依然「能動、有意義」,而不是直接壞掉或回傳假資料。
// 兩條路徑都遵守同一條紅線:只產生「建議」,教授必須主動確認/套用,絕不自動寫入。
const MODEL = "claude-sonnet-4-6-20251101";

function hasApiKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

async function callClaude(prompt: string, maxTokens = 300): Promise<string | null> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL, max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.content?.find((c: { type: string }) => c.type === "text")?.text;
    return text ?? null;
  } catch {
    return null; // fail-closed:API 失敗一律回傳 null,呼叫端會退回啟發式演算法,不會讓使用者卡住
  }
}

/** 依教授簡介文字,從候選子領域名稱中挑出建議標籤。回傳陣列一律需要教授手動確認才會實際套用。 */
export async function suggestSubfieldTags(bio: string, candidateSubfields: string[]): Promise<string[]> {
  if (!bio.trim() || candidateSubfields.length === 0) return [];

  if (hasApiKey()) {
    const prompt = `以下是一段教授的研究簡介,請從候選子領域清單中,挑出最相關的最多 5 個(只能挑清單內已有的名稱,不要自己發明新名稱)。只回傳 JSON 陣列,不要有其他文字。\n\n簡介:${bio}\n\n候選子領域:${candidateSubfields.join("、")}`;
    const text = await callClaude(prompt);
    if (text) {
      try {
        const parsed = JSON.parse(text.trim());
        if (Array.isArray(parsed)) return parsed.filter((s: string) => candidateSubfields.includes(s)).slice(0, 5);
      } catch { /* 回傳格式不是預期的 JSON,退回啟發式演算法 */ }
    }
  }

  // 啟發式退回方案:簡介文字裡若直接出現候選子領域名稱,即視為相關(不做語意理解,純字串比對)
  return candidateSubfields.filter((s) => bio.includes(s)).slice(0, 5);
}

/** 把落落長的申請動機,摘成一兩句重點,供教授快速比較用。 */
export async function summarizeMotivation(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return "";

  if (hasApiKey()) {
    const prompt = `請把以下學生的申請動機,摘要成一句不超過 50 字的重點,直接輸出摘要文字,不要加任何前綴或引號:\n\n${trimmed}`;
    const summary = await callClaude(prompt, 100);
    if (summary) return summary.trim().slice(0, 100);
  }

  // 啟發式退回方案:取前 50 字加刪節號,不是真正的摘要,但至少讓教授能快速掃過重點在哪
  return trimmed.length <= 50 ? trimmed : trimmed.slice(0, 50) + "……";
}

export function aiIntegrationMode(): "live" | "heuristic" {
  return hasApiKey() ? "live" : "heuristic";
}
