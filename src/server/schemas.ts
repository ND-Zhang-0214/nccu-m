// 集中式輸入驗證 schema(§4.4)
// ─────────────────────────────────────────────────────────────
// 規則:每一個接受外部輸入的進入點(Server Action / API route)第一步都用這裡的
// schema 驗證,不直接使用未經驗證的 formData.get()。集中於此便於複查與維護。
import { z } from "zod";

export const applySchema = z.object({
  postingId: z.string().min(1),
  motivation: z.string().min(20, "申請動機至少 20 字").max(2000),
  payload: z.string().default("{}"),
});

export const reportSchema = z.object({
  targetType: z.enum(["POSTING", "PROFESSOR", "USER"]),
  targetId: z.string().min(1),
  reason: z.string().min(10, "檢舉理由至少 10 字").max(1000),
});

// §4.4 對照 A05:狀態值白名單化,不接受任意字串——避免用戶端竄改後送出未定義狀態值。
export const applicationStatusSchema = z.object({
  applicationId: z.string().min(1),
  status: z.enum(["interview_invited", "interviewed", "accepted", "rejected"]),
});

export const reportDecisionSchema = z.object({
  id: z.string().min(1),
  decision: z.enum(["resolved", "dismissed"]),
});

export const professorVerifySchema = z.object({
  id: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
});

export const personaSchema = z.object({
  persona: z.enum(["STUDENT", "PROFESSOR"]),
  back: z.string().max(200).default("/"),
});

export const emailSchema = z.object({ email: z.string().email() });
export const verifySchema = z.object({ email: z.string().email(), code: z.string().length(6) });

// §2.5 管理員 2FA
export const totpVerifySchema = z.object({ code: z.string().length(6) });

// 站內訊息系統
export const sendMessageSchema = z.object({
  conversationId: z.string().min(1),
  body: z.string().min(1, "訊息不可為空").max(2000),
});
export const startConversationSchema = z.object({ applicationId: z.string().min(1) });
export const setStatusSchema = z.object({
  conversationId: z.string().min(1),
  status: z.enum(["available", "away"]),
  note: z.string().max(100).default(""),
});
export const addContactSchema = z.object({
  kind: z.enum(["LINE", "WEBSITE", "OTHER"]),
  value: z.string().min(1).max(300),
});
export const discloseContactSchema = z.object({
  conversationId: z.string().min(1),
  contactId: z.string().min(1),
});
