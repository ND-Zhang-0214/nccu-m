"use server";
// Server Actions:申請、簽署條款、檢舉、管理操作
// 所有動作皆:驗證登入 → 驗證輸入(zod)→ 執行 → 寫入稽核紀錄
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser, hasSignedTerms, signTerms, requestIp, logout } from "@/server/auth";
import { TERMS_VERSION } from "@/server/terms";
import { createApplication, getApplication, getPosting, updateApplicationStatus } from "@/server/repositories/postings";
import { audit, createReport, resolveReport, getReport } from "@/server/repositories/audit";
import { setProfessorVerify, getProfessor, getProfessorByUserId } from "@/server/repositories/professors";
import { notify, markAllRead } from "@/server/repositories/notifications";
import { setPersonaCookie, type Persona } from "@/server/persona";
import { headers } from "next/headers";

const applySchema = z.object({
  postingId: z.string().min(1),
  motivation: z.string().min(20, "申請動機至少 20 字").max(2000),
  payload: z.string().default("{}"),
});

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
    const msg = String(e);
    if (msg.includes("UNIQUE")) return { error: "你已申請過此需求,不可重複申請。" };
    return { error: "送出失敗,請稍後再試。" };
  }
  revalidatePath("/postings");
  return { ok: "申請已送出。教授審核後會更新狀態。" };
}

export async function signTermsAction() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const ua = headers().get("user-agent") || "";
  await signTerms(user.id, TERMS_VERSION, requestIp(), ua);
  await audit(user.id, "terms.sign", "TERMS", TERMS_VERSION);
  redirect("/postings");
}

export async function logoutAction() {
  await logout();
  redirect("/");
}

const reportSchema = z.object({
  targetType: z.enum(["POSTING", "PROFESSOR", "USER"]),
  targetId: z.string().min(1),
  reason: z.string().min(10, "檢舉理由至少 10 字").max(1000),
});

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

// ── 管理操作(僅 ADMIN;所有動作寫入稽核)─────────────────

async function requireAdmin() {
  const user = await currentUser();
  if (!user || user.role !== "ADMIN") redirect("/");
  return user;
}

export async function verifyProfessorAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id"));
  const decision = String(formData.get("decision")) as "APPROVED" | "REJECTED";
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
  const admin = await requireAdmin();
  const id = String(formData.get("id"));
  const decision = String(formData.get("decision")) as "resolved" | "dismissed";
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

// ── 申請狀態管理(教授/管理員;對應決策表 #6 並排比較介面的操作端)────

async function requireApplicationOwner(applicationId: string) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const app = await getApplication(applicationId);
  if (!app) redirect("/");
  const posting = await getPosting(app.postingId);
  if (!posting) redirect("/");
  const isOwner = posting.professor.userId === user.id;
  if (!isOwner && user.role !== "ADMIN") redirect("/");
  return { user, app, posting };
}

export async function updateApplicationStatusAction(formData: FormData) {
  const applicationId = String(formData.get("applicationId"));
  const status = String(formData.get("status"));
  const { user, app, posting } = await requireApplicationOwner(applicationId);
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
  const value = String(formData.get("persona")) as Persona;
  setPersonaCookie(value === "PROFESSOR" ? "PROFESSOR" : "STUDENT");
  const back = String(formData.get("back") || "/");
  redirect(back);
}

export async function markNotificationsReadAction() {
  const user = await currentUser();
  if (!user) redirect("/login");
  await markAllRead(user.id);
  revalidatePath("/notifications");
}
