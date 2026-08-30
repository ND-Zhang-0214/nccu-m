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

// 白皮書 2.7.2:群組共用檔案區。上傳本身走 multipart(api/files/upload/route.ts,非 server action,
// 理由同既有履歷附件上傳),此處只需要「刪除」這一個 server action 的驗證 schema。
export const deleteGroupFileSchema = z.object({ attachmentId: z.string().min(1) });

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
// 誠實標註:原表格「資格限制(年級、系所、修課、無)」該列沒有打勾,對照同表其餘五項
// 皆打勾,判讀為選填,故 qualificationRestriction 允許留空;contactPersonName/
// staffExtension 則對應 2.5.1「發文要求:強制填寫此計畫負責人姓名與分機,不可留空」
// ——這是每一則貼文都要有的課責署名,與本表的「聯繫方式」(供學生知道怎麼應徵)是兩件事。
export const createUnitPostingSchema = z.object({
  category: z.enum(["DEPT", "WORK_STUDY"]),
  title: z.string().min(4, "標題至少 4 字").max(200),
  description: z.string().min(20, "需求說明至少 20 字").max(5000),
  wage: z.string().min(1, "請填寫時薪/月薪").max(100),
  weeklyHoursAndTerm: z.string().min(1, "請填寫每週工時、聘期起訖").max(200),
  laborInsurance: z.string().min(1, "請填寫勞健保投保方式").max(200),
  workLocationAndContent: z.string().min(1, "請填寫工作地點、工作內容").max(1000),
  qualificationRestriction: z.string().max(200).default(""),
  contact: z.string().min(1, "請填寫聯繫方式").max(200),
  contactPersonName: z.string().min(1, "請填寫此職缺負責人姓名").max(50),
  staffExtension: z.string().min(1, "請填寫分機").max(20),
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
// 誠實標註簡化:表格寫「時程與截止日|✅|到期自動關閉」,若採自由文字則系統無法判斷
// 何時算到期——這裡把 deadline 限定為實際日期(<input type=date>),讓 2.6.2 的自動
// 關閉機制(見 repositories/lifecycle.ts 的 closeExpiredCollabPostings())真的能運作;
// 若還想寫更完整的時程敘述(如活動起訖),放進 description 自由文字欄位即可。
// otherTypeLabel 對應表格「類型|✅|下拉選單+『其他(自填)』」——只在選擇「其他合作」
// 時才有意義,這裡不做條件式必填(六分區本身「已暫時定案」,先求可用,不做過度複雜的
// 條件驗證),選填即可。
export const createStudentCollabPostingSchema = z.object({
  category: z.enum(["CLUB_RECRUIT", "TEAM_UP", "PROJECT_COLLAB", "EVENT_ORG", "STARTUP_IDEA", "OTHER_COLLAB"]),
  title: z.string().min(4, "標題至少 4 字").max(200),
  description: z.string().min(20, "詳細說明至少 20 字").max(5000),
  rolesNeeded: z.string().min(1, "請填寫需要的角色與人數").max(300),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "請選擇截止日"),
  otherTypeLabel: z.string().max(100).default(""),
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
// 白皮書 2.6.4:學生合作專區的專案勾選「需要教授指導」後,走同一套 2.3.1 請求流程。
const collabGuidePayloadSchema = z.object({
  projectSummary: z.string().min(15, "請簡述合作專案內容(至少 15 字)").max(2000),
  guidanceNeeded: z.string().min(5, "請說明需要哪方面的指導(至少 5 字)").max(500),
});

const REQUEST_PAYLOAD_SCHEMAS: Record<string, z.ZodTypeAny> = {
  REC: recPayloadSchema, UR: urPayloadSchema, LAB_JOIN: labJoinPayloadSchema,
  EXT_ENDORSE: extEndorsePayloadSchema, COLLAB_GUIDE: collabGuidePayloadSchema,
};

/** 依請求類型挑選對應的 payload schema 驗證(§2.1 四類學生發起事由,各自必填欄位不同)。 */
export function parseRequestPayload(type: string, raw: unknown) {
  const schema = REQUEST_PAYLOAD_SCHEMAS[type];
  if (!schema) return { success: false as const, error: { issues: [{ message: "未知的請求類型。" }] } };
  return schema.safeParse(raw);
}

export const studentRequestSchema = z.object({
  professorId: z.string().min(1),
  type: z.enum(["REC", "UR", "LAB_JOIN", "EXT_ENDORSE", "COLLAB_GUIDE"]),
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

// ── 白皮書 2.2.2/2.2.3/2.12.2/3.2.5(2026-08 第二輪)────────────────────
export const updateDisplayNameSchema = z.object({
  displayName: z.string().min(1, "顯示名稱不可空白").max(60),
});

export const setDegreeLevelSchema = z.object({
  degreeLevel: z.enum(["BACHELOR", "MASTER", "PHD"]),
});

export const revokeSessionSchema = z.object({
  sessionId: z.string().min(1),
});

export const hideUserSchema = z.object({
  targetUserId: z.string().min(1),
});

// ── 白皮書 2.8.1/2.8.3 需求編輯歷史 + 關閉機制(2026-08 第二輪)──────────
// 誠實標註簡化:編輯目前僅開放標題與說明兩個通用欄位;結構化欄位(如單位職缺的
// 薪資/工時等)若需要調整,目前設計上請改用「關閉」後重新發布,尚未支援逐欄位編輯。
export const editPostingSchema = z.object({
  postingId: z.string().min(1),
  title: z.string().min(4, "標題至少 4 字").max(200),
  description: z.string().min(20, "需求說明至少 20 字").max(5000),
});

export const closePostingSchema = z.object({
  postingId: z.string().min(1),
  reason: z.string().max(200).default(""),
});

export const reopenPostingSchema = z.object({
  postingId: z.string().min(1),
});

// ── 白皮書 2.5.1 單位帳號建立(管理員審核與分類,見 repositories/units.ts 的
//    createUnitAccount() 註解說明簡化選擇)────────────────────────
export const createUnitAccountSchema = z.object({
  name: z.string().min(1, "請填寫單位名稱").max(100),
  contactEmail: z.string().email("請輸入有效的公務信箱"),
  extension: z.string().max(20).default(""),
});

// ── 白皮書 2.2.3:碩博生自行發布需求找幫手的學制驗證(2026-08 第二輪)────────
export const verifyDegreeLevelSchema = z.object({
  studentEmail: z.string().email("請輸入有效的校內信箱"),
});
