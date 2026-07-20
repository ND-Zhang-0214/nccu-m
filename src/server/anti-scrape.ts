// 反爬取協調層(整合 §3.2 分級曝光、§3.3 列舉偵測、§3.4 條件式人機驗證)
// ─────────────────────────────────────────────────────────────
// 頁面呼叫方式:在會被逐一翻閱的資源頁(教授檔案、子領域列表、需求詳情)最上方呼叫
// guardAgainstScraping(),依風險等級自動處理延遲或導向人機驗證,不需頁面自行判斷。
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash } from "node:crypto";
import { currentUser } from "@/server/auth";
import { recordAccessAndAssess } from "@/server/repositories/access";
import { hasValidHumanCheck } from "@/server/captcha";

/** 未登入訪客的匿名識別鍵:IP+UA 雜湊,不寫入 cookie、不具個人可識別性。
 *  已知限制:同 IP 使用者(如系辦公用電腦)會共用同一把 key,屬保守的過渡方案;
 *  升級路徑見架構規格 §10 原則 7——之後可換成 middleware 派發的匿名 cookie。 */
function anonymousKey(): string {
  const h = headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  const ua = h.get("user-agent") || "unknown";
  return "anon:" + createHash("sha256").update(`${ip}::${ua}`).digest("hex").slice(0, 24);
}

export async function guardAgainstScraping(
  resourceType: "PROFESSOR" | "POSTING" | "SUBFIELD", resourceId: string, currentPath: string,
) {
  const user = await currentUser();
  const actorKey = user ? user.id : anonymousKey();

  const risk = await recordAccessAndAssess(actorKey, resourceType, resourceId);
  if (risk === "none") return;

  if (risk === "soft") {
    // 漸進延遲:爬取者體感變慢(累積起來對大量抓取的成本很高),正常使用者幾乎無感。
    await new Promise((r) => setTimeout(r, 300));
    return;
  }

  // risk === "hard":需通過一次人機驗證才能繼續,通過後 30 分鐘內不重複要求。
  const passed = await hasValidHumanCheck(actorKey);
  if (!passed) {
    redirect(`/verify-human?next=${encodeURIComponent(currentPath)}`);
  }
}
