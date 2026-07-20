"use server";
// Server Actions:申請、簽署條款、檢舉、管理操作
// 所有動作皆:驗證登入/授權(authz.ts)→ 驗證輸入(schemas.ts)→ 執行 → 寫入稽核紀錄
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { currentUser, hasSignedTerms, signTerms, requestIp, logout, currentSession, markSessionStepUp } from "@/server/auth";
import { TERMS_VERSION } from "@/server/terms";
import { createApplication, getPosting, updateApplicationStatus } from "@/server/repositories/postings";
import { audit, createReport, resolveReport, getReport } from "@/server/repositories/audit";
import { setProfessorVerify, getProfessor } from "@/server/repositories/professors";
import { notify, markAllRead } from "@/server/repositories/notifications";
import { setPersonaCookie, type Persona } from "@/server/persona";
import { requireUser, requireAdmin, requireApplicationStatusEditor } from "@/server/authz";
import {
  applySchema, reportSchema, applicationStatusSchema, reportDecisionSchema,
  professorVerifySchema, personaSchema,
} from "@/server/schemas";
import { logSecurityEvent } from "@/server/repositories/security";
import { generateSecret, getOtpauthUrl, encryptSecret, verifyTotpCode } from "@/server/totp";
import { totpVerifySchema } from "@/server/schemas";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { eq } from "drizzle-orm";

export async function applyAction(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) return { error: "請先登入校內帳號。" };
  if (!(await hasSignedTerms(user.id, TERMS_VERSION))) {
    return { error: "請先於「服務條款」頁完成本版本條款簽署,再送出申請。", needTerms: true };
  }
  const parsed = applySchema.safeParse({
    postingId: formData.get("postingId"),
    motivation: formData.get("motivation"),
    payload: formData.get("payload") || "{}",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(parsed.data.payload); } catch { payload = {}; }

  try {
    const app = await createApplication({
      postingId: parsed.data.postingId,
      applicantId: user.id,
      motivation: parsed.data.motivation,
      payload,
    });
    await audit(user.id, "application.create", "APPLICATION", app.id);
    const posting = await getPosting(parsed.data.postingId);
    if (posting?.professor.userId) {
      await notify(posting.professor.userId, "application.new", "收到一則新申請",
        `「${posting.title}」有新的申請,前往查看並比較。`, `/postings/${posting.id}/applications`);
    }
  } catch (e: unknown) {
    // §4.3 fail-closed:對外一律一般化訊息,細節只落在伺服器日誌(e 不外傳)。
    const msg = String(e);
    if (msg.includes("UNIQUE")) return { error: "你已申請過此需求,不可重複申請。" };
    return { error: "送出失敗,請稍後再試。" };
  }
  revalidatePath("/postings");
  return { ok: "申請已送出。教授審核後會更新狀態。" };
}

export async function signTermsAction() {
  const user = await requireUser();
  const ua = headers().get("user-agent") || "";
  await signTerms(user.id, TERMS_VERSION, requestIp(), ua);
  await audit(user.id, "terms.sign", "TERMS", TERMS_VERSION);
  redirect("/postings");
}

export async function logoutAction() {
  await logout();
  redirect("/");
}

export async function reportAction(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) return { error: "請先登入後再檢舉。" };
  const parsed = reportSchema.safeParse({
    targetType: formData.get("targetType"),
    targetId: formData.get("targetId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await createReport(user.id, parsed.data.targetType, parsed.data.targetId, parsed.data.reason);
  await audit(user.id, "report.create", parsed.data.targetType, parsed.data.targetId);
  return { ok: "檢舉已送出。安全疑慮案件將於 48 小時內初步處理,一般案件 7 日內。" };
}

// ── 管理操作(僅 ADMIN,需 2FA;所有動作寫入稽核)─────────────

export async function verifyProfessorAction(formData: FormData) {
  const admin = await requireAdmin("/admin");
  const parsed = professorVerifySchema.safeParse({
    id: formData.get("id"), decision: formData.get("decision"),
  });
  if (!parsed.success) return; // fail-closed:格式不對直接不執行
  const { id, decision } = parsed.data;
  await setProfessorVerify(id, decision);
  await audit(admin.id, `professor.verify.${decision.toLowerCase()}`, "PROFESSOR", id);
  const prof = await getProfessor(id);
  if (prof?.prof.userId) {
    await notify(prof.prof.userId, "professor.verified",
      decision === "APPROVED" ? "你的教授帳號已核准" : "你的教授帳號審核未通過",
      decision === "APPROVED" ? "現在可以發布需求了。" : "如有疑問請聯絡管理員。", "/professor/dashboard");
  }
  revalidatePath("/admin");
}

export async function resolveReportAction(formData: FormData) {
  const admin = await requireAdmin("/admin");
  const parsed = reportDecisionSchema.safeParse({
    id: formData.get("id"), decision: formData.get("decision"),
  });
  if (!parsed.success) return;
  const { id, decision } = parsed.data;
  await resolveReport(id, decision, decision === "resolved" ? "成立" : "不成立");
  await audit(admin.id, `report.${decision}`, "REPORT", id);

  // 對應決策表 #4:結案後雙方皆收到中性通知,不做無聲移除
  const report = await getReport(id);
  if (report) {
    await notify(
      report.reporterId, "report.resolved", "你送出的檢舉已結案",
      decision === "resolved" ? "管理員審查後認定檢舉成立。" : "管理員審查後認定檢舉不成立。",
      "/me/reports",
    );
    if (report.targetType === "USER") {
      await notify(report.targetId, "report.resolved", "有一則與你相關的檢舉已結案",
        "管理員已完成審查,如需說明可聯絡管理員。", "/notifications");
    } else if (report.targetType === "POSTING") {
      const posting = await getPosting(report.targetId);
      if (posting?.professor.userId) {
        await notify(posting.professor.userId, "report.resolved", "有一則與你發布的需求相關的檢舉已結案",
          "管理員已完成審查,如需說明可聯絡管理員。", "/notifications");
      }
    }
  }
  revalidatePath("/admin");
}

// ── 申請狀態管理(教授本人/管理員;§2.2 IDOR 防護 + 狀態白名單)──

export async function updateApplicationStatusAction(formData: FormData) {
  const parsed = applicationStatusSchema.safeParse({
    applicationId: formData.get("applicationId"), status: formData.get("status"),
  });
  if (!parsed.success) return; // fail-closed
  const { applicationId, status } = parsed.data;

  // requireApplicationStatusEditor 刻意排除申請人本人——避免學生自行核准/婉拒自己的申請
  const { user, app, posting } = await requireApplicationStatusEditor(applicationId);
  await updateApplicationStatus(applicationId, status);
  await audit(user.id, "application.status.update", "APPLICATION", applicationId, { status });

  const statusLabel: Record<string, string> = {
    interview_invited: "已邀請面試", interviewed: "已完成面試", accepted: "審核通過", rejected: "婉拒",
  };
  await notify(
    app.applicantId, "application.status", `你的申請狀態更新:${statusLabel[status] ?? status}`,
    `「${posting.title}」的申請狀態已更新。`, `/me/applications`,
  );
  revalidatePath(`/postings/${app.postingId}/applications`);
}

// ── 身分視角切換(對應決策表 #9;僅影響導覽顯示)──────────────

export async function switchPersonaAction(formData: FormData) {
  const parsed = personaSchema.safeParse({
    persona: formData.get("persona"), back: formData.get("back") || "/",
  });
  if (!parsed.success) return;
  setPersonaCookie(parsed.data.persona as Persona);
  redirect(parsed.data.back);
}

export async function markNotificationsReadAction() {
  const user = await requireUser();
  await markAllRead(user.id);
  revalidatePath("/notifications");
}

// ── §2.5 管理員雙因素驗證(啟用 + 重驗)────────────────────
// 這兩個動作刻意不經過 requireAdmin()(會造成導向迴圈,setup/step-up 本身就是
// requireAdmin 導向的目的地),改為直接檢查 role,但一樣是 fail-closed。

export async function setupTotpAction(formData: FormData) {
  const user = await currentUser();
  if (!user || user.role !== "ADMIN") redirect("/");
  const next = String(formData.get("next") || "/admin");
  const secret = String(formData.get("secret") || "");
  const parsed = totpVerifySchema.safeParse({ code: formData.get("code") });

  if (!secret || !parsed.success) {
    redirect(`/admin/setup-2fa?next=${encodeURIComponent(next)}`);
  }

  const encSecret = encryptSecret(secret);
  const ok = verifyTotpCode(encSecret, parsed.data.code);
  if (!ok) {
    await logSecurityEvent("admin.step_up", "medium", user.id, "", { result: "setup_failed" });
    redirect(`/admin/setup-2fa?next=${encodeURIComponent(next)}&error=1`);
  }

  await db.update(t.users).set({ totpSecretEnc: encSecret, totpEnabled: true }).where(eq(t.users.id, user.id));
  await audit(user.id, "admin.2fa.enabled");
  const session = await currentSession();
  if (session) await markSessionStepUp(session.id);
  redirect(next);
}

export async function stepUpTotpAction(formData: FormData) {
  const user = await currentUser();
  if (!user || user.role !== "ADMIN" || !user.totpSecretEnc) redirect("/");
  const next = String(formData.get("next") || "/admin");
  const parsed = totpVerifySchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) {
    redirect(`/admin/step-up?next=${encodeURIComponent(next)}`);
  }

  const ok = verifyTotpCode(user.totpSecretEnc, parsed.data.code);
  if (!ok) {
    await logSecurityEvent("admin.step_up", "medium", user.id, "", { result: "failed" });
    redirect(`/admin/step-up?next=${encodeURIComponent(next)}&error=1`);
  }
  const session = await currentSession();
  if (session) await markSessionStepUp(session.id);
  await logSecurityEvent("admin.step_up", "low", user.id, "", { result: "ok" });
  redirect(next);
}
