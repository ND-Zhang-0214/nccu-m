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

// §2.5 雙人核可
export const requestApprovalSchema = z.object({
  action: z.enum(["conversation.view_messages"]),
  targetType: z.enum(["CONVERSATION"]),
  targetId: z.string().min(1),
});
export const decideApprovalSchema = z.object({
  id: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
});

// 面試時段
export const createSlotsSchema = z.object({
  postingId: z.string().min(1),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  location: z.string().max(200).default(""),
});
export const bookSlotSchema = z.object({ slotId: z.string().min(1), applicationId: z.string().min(1) });

// 教授群組
export const createGroupSchema = z.object({ name: z.string().min(1).max(100), description: z.string().max(500).default("") });
export const inviteMemberSchema = z.object({ groupId: z.string().min(1), email: z.string().email() });
export const groupPostSchema = z.object({ groupId: z.string().min(1), body: z.string().min(1).max(2000) });

// AI 輔助
export const suggestTagsSchema = z.object({ professorId: z.string().min(1) });
export const summarizeSchema = z.object({ applicationId: z.string().min(1) });
export const addSpecialtySchema = z.object({ professorId: z.string().min(1), subfieldId: z.string().min(1) });

// ── 白皮書 2.1 二維模型:教授/單位發布新需求(2026-08 新增)──────────────
export const createPostingSchema = z.object({
  category: z.enum(["TA", "RA", "LAB", "EXT"]), // DEPT 改由單位帳號發布,見 createUnitPostingSchema
  title: z.string().min(4, "標題至少 4 字").max(200),
  description: z.string().min(20, "需求說明至少 20 字").max(5000),
});

// 白皮書 2.5.3:單位帳號發布(系辦短期 DEPT / 校內工讀 WORK_STUDY),結構化必填欄位。
export const createUnitPostingSchema = z.object({
  category: z.enum(["DEPT", "WORK_STUDY"]),
  title: z.string().min(4, "標題至少 4 字").max(200),
  description: z.string().min(20, "需求說明至少 20 字").max(5000),
  wage: z.string().min(1, "請填寫時薪/月薪").max(100),
  weeklyHoursAndTerm: z.string().min(1, "請填寫每週工時、聘期起訖").max(200),
  laborInsurance: z.string().min(1, "請填寫勞健保投保方式").max(200),
  workLocationAndContent: z.string().min(1, "請填寫工作地點、工作內容").max(1000),
  contact: z.string().min(1, "請填寫聯繫方式").max(200),
  eligibility: z.string().max(300).default(""), // 資格限制,白皮書標為選填(無勾選必填)
});

// 白皮書 2.4.1:碩博生自行發布需求找幫手,報酬形式與所屬指導教授為必填(課責用非核准)。
export const createGradHelperPostingSchema = z.object({
  title: z.string().min(4, "標題至少 4 字").max(200),
  description: z.string().min(20, "需求說明至少 20 字").max(5000),
  compensationType: z.enum(["HOURLY", "CREDIT", "COAUTHOR", "UNPAID"]),
  advisorName: z.string().min(1, "請填寫所屬指導教授").max(100),
});

// 白皮書 2.6.2:學生合作專區六分區共用欄位。
export const createStudentCollabPostingSchema = z.object({
  category: z.enum(["CLUB_RECRUIT", "TEAM_UP", "PROJECT_COLLAB", "EVENT_ORG", "STARTUP_IDEA", "OTHER_COLLAB"]),
  title: z.string().min(4, "標題至少 4 字").max(200),
  description: z.string().min(20, "詳細說明至少 20 字").max(5000),
  rolesNeeded: z.string().min(1, "請填寫需要的角色與人數").max(300),
  deadline: z.string().min(1, "請填寫時程與截止日"),
  needsProfessorGuidance: z.enum(["on", "off"]).default("off").transform((v) => v === "on"),
  compensationNote: z.string().max(500).default(""),
});

// ── 白皮書 2.3.1「可受理的學生請求」五項設定區(2026-08 新增)────────────
export const intakeSettingSchema = z.object({
  type: z.enum(["REC", "UR", "LAB_JOIN", "EXT_ENDORSE", "COLLAB_GUIDE"]),
  enabled: z.enum(["on", "off"]).transform((v) => v === "on"),
  conditionText: z.string().max(500).default(""),
  quotaNote: z.string().max(200).default(""),
});

// ── 白皮書 2.9 推薦信 / 2.10 大專生計畫等「學生 → 教授」請求(2026-08 新增)────
// payload 依 type 各自定義必填欄位,不用同一組欄位硬套四種情境(白皮書明定四類欄位不同)。
const recPayloadSchema = z.object({
  purpose: z.string().min(5, "請說明推薦信目的(至少 5 字)").max(300),
  deadline: z.string().max(30).default(""),
  subject: z.string().min(15, "請求信主旨至少 15 字(含過去學經歷與希望協助的原因)").max(2000),
});
const urPayloadSchema = z.object({
  proposal: z.string().min(30, "研究構想至少 30 字").max(3000),
});
const labJoinPayloadSchema = z.object({
  motivation: z.string().min(15, "動機與背景至少 15 字").max(2000),
  availability: z.string().max(500).default(""),
});
const extEndorsePayloadSchema = z.object({
  projectName: z.string().min(2, "請填寫計畫名稱").max(200),
  sponsor: z.string().min(2, "請填寫計畫來源/單位(如學海築夢、TOP1000 等)").max(200),
  detail: z.string().min(15, "說明至少 15 字").max(2000),
});

const REQUEST_PAYLOAD_SCHEMAS: Record<string, z.ZodTypeAny> = {
  REC: recPayloadSchema, UR: urPayloadSchema, LAB_JOIN: labJoinPayloadSchema, EXT_ENDORSE: extEndorsePayloadSchema,
};

/** 依請求類型挑選對應的 payload schema 驗證(§2.1 四類學生發起事由,各自必填欄位不同)。 */
export function parseRequestPayload(type: string, raw: unknown) {
  const schema = REQUEST_PAYLOAD_SCHEMAS[type];
  if (!schema) return { success: false as const, error: { issues: [{ message: "未知的請求類型。" }] } };
  return schema.safeParse(raw);
}

export const studentRequestSchema = z.object({
  professorId: z.string().min(1),
  type: z.enum(["REC", "UR", "LAB_JOIN", "EXT_ENDORSE"]),
  payload: z.string().default("{}"), // JSON 字串,實際欄位驗證見 parseRequestPayload
});

export const respondRequestSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["accept", "decline", "want_to_talk"]),
});

export const finalizeRecommendationSchema = z.object({
  requestId: z.string().min(1),
  outcome: z.enum(["sent", "declined_after_accept"]),
});
