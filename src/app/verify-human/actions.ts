"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { currentUser } from "@/server/auth";
import { grantHumanCheck } from "@/server/captcha";
import { logSecurityEvent } from "@/server/repositories/security";

function anonymousKey() {
  const h = headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  const ua = h.get("user-agent") || "unknown";
  return "anon:" + createHash("sha256").update(`${ip}::${ua}`).digest("hex").slice(0, 24);
}

export async function verifyHumanAction(formData: FormData) {
  const a = Number(formData.get("a"));
  const b = Number(formData.get("b"));
  const answer = Number(formData.get("answer"));
  const next = String(formData.get("next") || "/");

  if (answer !== a + b) {
    redirect(`/verify-human?next=${encodeURIComponent(next)}`);
  }

  const user = await currentUser();
  const actorKey = user ? user.id : anonymousKey();
  await grantHumanCheck(actorKey);
  await logSecurityEvent("human_check.passed", "low", user?.id ?? null, "", {});
  redirect(next);
}
