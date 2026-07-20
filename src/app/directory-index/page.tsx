// §3.5 蜜罐:此路由不會被真人透過任何可見連結點到(見 card-grid 裡的 .bait-link),
// 任何存取都高機率為自動化爬取程式,記錄安全事件供人工複查,不直接封鎖(呼應治理原則:
// 懲罰須人工確認,AI/程式最多標記待審)。回應內容刻意與一般 404 無異,不透露偵測邏輯。
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { logSecurityEvent } from "@/server/repositories/security";

export const dynamic = "force-dynamic";

export default async function HoneypotPage() {
  const h = headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  await logSecurityEvent("honeypot.triggered", "high", null, ip, {
    userAgent: h.get("user-agent") || "unknown",
  });
  notFound();
}
