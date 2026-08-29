// 種子腳本:讀取 data/nccu-structure.json 建立分類樹與示範資料
// 重建整個資料庫:npm run db:reset
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { db } from "./client";
import * as t from "./schema";

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, "data", "nccu-structure.json"), "utf8"));

async function main() {
  console.log("→ 建立學院/系所/領域/子領域 …");
  const deptBySlug = new Map<string, string>();
  const subfieldByName = new Map<string, string>();

  let cOrder = 0;
  for (const c of data.colleges) {
    const [college] = await db.insert(t.colleges)
      .values({ name: c.name, slug: c.slug, sortOrder: cOrder++ }).returning();
    let dOrder = 0;
    for (const d of c.departments) {
      const [dept] = await db.insert(t.departments)
        .values({ collegeId: college.id, name: d.name, slug: d.slug, sortOrder: dOrder++ }).returning();
      deptBySlug.set(d.slug, dept.id);
      let fOrder = 0;
      for (const f of d.fields ?? []) {
        const [field] = await db.insert(t.fields)
          .values({ departmentId: dept.id, name: f.name, sortOrder: fOrder++ }).returning();
        let sOrder = 0;
        for (const s of f.subfields ?? []) {
          const [sub] = await db.insert(t.subfields)
            .values({ fieldId: field.id, name: s, sortOrder: sOrder++ }).returning();
          subfieldByName.set(s, sub.id);
        }
      }
    }
  }

  console.log("→ 建立示範教授(假資料)…");
  const sp = data.sampleProfessors;
  const deptId = deptBySlug.get(sp.department)!;
  let firstProfId = "";
  for (const p of sp.list) {
    const [prof] = await db.insert(t.professorProfiles).values({
      displayName: p.name, title: p.title, departmentId: deptId, bio: p.bio, verifyStatus: "SEED",
    }).returning();
    if (!firstProfId) firstProfId = prof.id;
    for (const sName of p.subfields) {
      const subId = subfieldByName.get(sName);
      if (subId) await db.insert(t.professorSpecialties).values({ professorId: prof.id, subfieldId: subId });
    }
  }

  console.log("→ 建立示範需求與管理員帳號 …");
  // 白皮書 2.1 二維模型(2026-08 重構):postings 只保留「教授/單位 → 學生」四類廣播式需求
  // (TA/RA/LAB/DEPT/EXT);IND(產學跨域)已依 1.3 排除範圍移除;UR/REC 改為學生發起,
  // 種子資料改在下方以 studentRequests 呈現,不再是 postings。
  const allProfs = await db.select().from(t.professorProfiles);
  const p2 = allProfs[1]?.id ?? firstProfId;
  const p3 = allProfs[2]?.id ?? firstProfId;
  await db.insert(t.postings).values([
    {
      professorId: firstProfId, category: "TA",
      title: "【示範】語言學概論 課程助教",
      description: "此為示範資料。需批改作業並主持每週討論課。",
    },
    {
      professorId: firstProfId, category: "RA",
      title: "【示範】研究助理:語料庫標註計畫",
      description: "此為示範資料。協助建置與標註跨語言句法語料庫,需細心與基本統計能力。",
    },
    {
      professorId: p2, category: "LAB",
      title: "【示範】實驗室成員招募:語音與認知實驗室",
      description: "此為示範資料。誠徵長期投入之大學部/碩士生加入實驗室,參與例會與資料蒐集。",
    },
    {
      professorId: p3, category: "DEPT",
      title: "【示範】系辦短期:國際研討會接待支援",
      description: "此為示範資料。研討會期間協助報到與接待,每日彈性排班。",
    },
    {
      professorId: p2, category: "EXT",
      title: "【示範】校外計畫指導教授:教育部學海築夢",
      description: "此為示範資料。有名額時開放,協助銜接海外語言學研究交流計畫。",
    },
  ]);

  await db.insert(t.users).values({
    email: "admin@nccu.edu.tw",
    displayName: "平台管理員(示範)",
    role: "ADMIN",
    subRoles: JSON.stringify(["ADMIN"]),
  });

  // 示範教授帳號:將第一位示範教授連結到一個真實使用者帳號,
  // 供測試教授儀表板 / 身分視角切換 / 並排比較申請等功能使用。
  const [profUser] = await db.insert(t.users).values({
    email: "professor.demo@nccu.edu.tw",
    displayName: "示範教授本人帳號",
    role: "PROFESSOR",
    subRoles: JSON.stringify(["PROFESSOR"]),
  }).returning();
  await db.update(t.professorProfiles)
    .set({ userId: profUser.id, verifyStatus: "APPROVED" })
    .where(eq(t.professorProfiles.id, firstProfId));

  console.log("→ 建立示範「可受理的學生請求」設定與示範請求(§2.3.1/§2.9)…");
  // 示範教授開放推薦信與大專生計畫,p2 開放加入實驗室,示範學生分辨不同狀態的樣貌。
  await db.insert(t.professorIntakeSettings).values([
    {
      professorId: firstProfId, type: "REC", enabled: true,
      conditionText: "修過我的課且成績 B+ 以上,至少需在截止日的兩週前告知。",
      quotaNote: "每學期 2 封(已撰寫 0 封)",
    },
    {
      professorId: firstProfId, type: "UR", enabled: true,
      conditionText: "需先繳交一頁研究構想。",
      quotaNote: "每年 1 組",
    },
    { professorId: firstProfId, type: "LAB_JOIN", enabled: false, conditionText: "", quotaNote: "" },
    { professorId: firstProfId, type: "EXT_ENDORSE", enabled: false, conditionText: "", quotaNote: "" },
    { professorId: firstProfId, type: "COLLAB_GUIDE", enabled: false, conditionText: "", quotaNote: "" },
    {
      professorId: p2, type: "LAB_JOIN", enabled: true,
      conditionText: "歡迎大學部二年級以上、對語音認知有興趣的學生,先email簡短自我介紹。",
      quotaNote: "不限制",
    },
  ]);

  const [demoStudent] = await db.insert(t.users).values({
    email: "student.demo@g.nccu.edu.tw",
    displayName: "示範學生本人帳號",
    role: "STUDENT_BACHELOR",
    subRoles: JSON.stringify([]),
  }).returning();
  await db.insert(t.studentRequests).values({
    type: "REC", studentId: demoStudent.id, professorId: firstProfId, status: "pending",
    payload: JSON.stringify({
      purpose: "申請美國 OO 大學語言學研究所",
      deadline: "2026-11-15",
      subject: "此為示範資料。修過老師的語言學概論與句法學,成績皆為 A,對計算語言學特別感興趣,希望老師能就課堂表現與期末專題協助撰寫推薦信。",
    }),
  });

  console.log("✓ 種子資料建立完成");
}

main().catch((e) => { console.error(e); process.exit(1); });
