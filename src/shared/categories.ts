// 共用常數,故意不放在 src/server 底下:client component(如即時篩選列)也需要引用,
// 若放在 server/repositories 裡會把資料庫連線一併打包進瀏覽器端程式碼,導致建置失敗。
//
// 白皮書 2.1「事由 × 發起方」二維模型(2026-08 重構):
// CATEGORIES = 教授/單位/學生 → 學生或彼此(廣播式需求,postings 表);
// REQUEST_TYPES = 學生 → 教授(結構化請求,student_requests 表,見 2.3.1/2.9/2.10)。
// IND(產學/跨域)已依白皮書 1.3 排除範圍(已定案)移除,不再是合法類別。
//
// 2026-08 第二輪(白皮書 2.4/2.5/2.6):postings 的發起方不再只有教授,
// 見 PosterType 與各類別對應的發起方。

export type PosterType = "PROFESSOR" | "UNIT" | "STUDENT";

// 教授發起(白皮書 2.1、2.3.2)
export const PROFESSOR_CATEGORIES: Record<string, string> = {
  TA: "課程助教",
  RA: "研究助理",
  LAB: "實驗室成員招募",
  EXT: "校外計畫指導教授",
};

// 單位發起(白皮書 2.5,系辦短期沿用既有 DEPT,校內工讀為本輪新增)
export const UNIT_CATEGORIES: Record<string, string> = {
  DEPT: "系辦短期",
  WORK_STUDY: "校內工讀",
};

// 學生發起 → 找幫手(白皮書 2.4,碩博生自行發布需求)
export const GRAD_HELPER_CATEGORIES: Record<string, string> = {
  GRAD_HELPER: "碩博生研究幫手",
};

// 學生發起 → 學生合作專區六分區(白皮書 2.6,已暫時定案)
export const STUDENT_COLLAB_CATEGORIES: Record<string, string> = {
  CLUB_RECRUIT: "社團招新",
  TEAM_UP: "競賽組隊",
  PROJECT_COLLAB: "專案合作",
  EVENT_ORG: "活動籌辦",
  STARTUP_IDEA: "創業構想",
  OTHER_COLLAB: "其他合作",
};

// 全部類別(用於泛用查詢,如需求列表的分類文字對照)
export const CATEGORIES: Record<string, string> = {
  ...PROFESSOR_CATEGORIES,
  ...UNIT_CATEGORIES,
  ...GRAD_HELPER_CATEGORIES,
  ...STUDENT_COLLAB_CATEGORIES,
};

export function posterTypeForCategory(category: string): PosterType {
  if (category in PROFESSOR_CATEGORIES) return "PROFESSOR";
  if (category in UNIT_CATEGORIES) return "UNIT";
  return "STUDENT"; // GRAD_HELPER + 六分區皆為學生發起
}

export const STUDENT_COLLAB_CATEGORY_ORDER = Object.keys(STUDENT_COLLAB_CATEGORIES);

export const REQUEST_TYPES: Record<string, string> = {
  REC: "推薦信",
  UR: "大專生研究計畫",
  LAB_JOIN: "加入實驗室/畢業專題",
  EXT_ENDORSE: "請教授掛名校外計畫",
  COLLAB_GUIDE: "指導學生合作專案",
};

// 對應教授「可受理的學生請求」五項設定區(白皮書 2.3.1)的順序與說明文字。
export const INTAKE_TYPE_ORDER = ["REC", "UR", "LAB_JOIN", "EXT_ENDORSE", "COLLAB_GUIDE"] as const;
export type IntakeType = (typeof INTAKE_TYPE_ORDER)[number];

// COLLAB_GUIDE 現在有出口了(白皮書 2.6.4:學生合作專區勾選「需要教授指導」後,
// 走與 REC/UR 相同的 2.3.1 請求流程)——2026-08 第二輪學生合作專區上線後打開此項。
export const INTAKE_TYPES_WITH_REQUEST_FORM: readonly string[] = ["REC", "UR", "LAB_JOIN", "EXT_ENDORSE", "COLLAB_GUIDE"];

// student_requests 狀態機的顯示文字(§2.9/2.3.1 統一狀態機)
export const REQUEST_STATUS_LABELS: Record<string, string> = {
  pending: "待教授回應",
  wants_to_talk: "教授希望先談談",
  accepted: "教授已接受",
  writing: "撰寫中",
  sent: "已送出",
  declined_after_accept: "了解後婉拒",
  declined: "婉拒",
};

export const DEGREE_LEVEL_LABELS: Record<string, string> = {
  BACHELOR: "學士",
  MASTER: "碩士",
  PHD: "博士",
};

// 白皮書 2.4.1:GRAD_HELPER 報酬形式的顯示文字。集中放在這裡讓「發布表單」與
// 「需求詳情頁的結構化欄位顯示」共用同一份對照,不會出現兩處各自維護、日後改一邊漏改
// 另一邊的問題。
export const COMPENSATION_TYPE_LABELS: Record<string, string> = {
  HOURLY: "時薪", CREDIT: "掛名致謝", COAUTHOR: "共同作者", UNPAID: "無報酬",
};

// postings.structuredFields 各類別欄位的顯示標籤,供需求詳情頁(postings/[id])的
// 「詳細資訊」區塊使用——發布表單(createUnitPostingSchema / createGradHelperPostingSchema /
// createStudentCollabPostingSchema)蒐集的結構化欄位,先前只寫進 DB 卻從未顯示給瀏覽者看,
// 屬於功能缺口(尤其單位職缺的時薪/工時/勞健保/聯繫方式等,學生應徵前本來就該看得到)。
// needsProfessorGuidance 刻意不放進來——它是控制「教授指導」提示區塊要不要出現的布林
// 旗標,不是要單獨條列顯示的一筆資訊,頁面另外處理。
export const STRUCTURED_FIELD_LABELS: Record<string, string> = {
  // 單位帳號發布(白皮書 2.5.3)
  wage: "時薪/月薪",
  weeklyHoursAndTerm: "每週工時、聘期起訖",
  laborInsurance: "勞健保投保方式",
  workLocationAndContent: "工作地點、工作內容",
  qualificationRestriction: "資格限制",
  contact: "聯繫方式",
  contactPersonName: "職缺負責人姓名",
  staffExtension: "分機",
  // 碩博生自行發布需求找幫手(白皮書 2.4.1)
  compensationType: "報酬形式",
  advisorName: "所屬指導教授",
  // 學生合作專區六分區(白皮書 2.6.2)
  rolesNeeded: "需要的角色與人數",
  deadline: "截止日",
  otherTypeLabel: "類型(其他,自填)",
  compensationNote: "報酬/其他補充說明",
};

// 示範環境「一鍵登入」對應的角色清單(白皮書 2.11.4 登入門檻上線後,對應使用者需求
// 「先設計一組虛擬可以直接通過的帳密或是登入方式讓我可以 present」)。放在這裡而不是
// server/actions.ts,理由與本檔案開頭註解相同:src/app/login/page.tsx 是 client component,
// 要畫按鈕清單,不能引入會牽動 db client 的伺服器端模組。三個帳號對應
// src/server/db/seed.ts 建立的示範帳號,刻意不是隨機建立的空帳號——教授已連結
// professorProfiles、學生已有申請/請求紀錄等,登入後才有實際內容可以 present。
// 真正的 NODE_ENV 判斷仍在伺服器端(quickLoginDemo/quickLoginAction),這裡的清單只決定
// UI 要不要「顯示」按鈕,不是信任邊界——即使有人在正式環境硬送出表單,伺服器端一樣會拒絕。
export const DEMO_PERSONAS: { key: string; label: string; email: string }[] = [
  { key: "student", label: "示範學生", email: "student.demo@g.nccu.edu.tw" },
  { key: "professor", label: "示範教授", email: "professor.demo@nccu.edu.tw" },
  { key: "admin", label: "示範管理員(需另外通過雙因素驗證)", email: "admin@nccu.edu.tw" },
];
