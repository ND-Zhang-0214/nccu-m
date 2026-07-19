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
  const allProfs = await db.select().from(t.professorProfiles);
  const p2 = allProfs[1]?.id ?? firstProfId;
  const p3 = allProfs[2]?.id ?? firstProfId;
  await db.insert(t.postings).values([
    {
      professorId: firstProfId, category: "UR",
      title: "【示範】大專生計畫:跨語言句法比較研究",
      description: "此為示範資料。誠徵對句法學有興趣之大學部學生,協助語料標註與文獻整理。",
    },
    {
      professorId: firstProfId, category: "TA",
      title: "【示範】語言學概論 課程助教",
      description: "此為示範資料。需批改作業並主持每週討論課。",
    },
    {
      professorId: p2, category: "REC",
      title: "【示範】推薦信申請窗口:語言學研究所方向",
      description: "此為示範資料。申請國內外語言學研究所推薦信,請附目標學校與截止日。",
    },
    {
      professorId: p3, category: "DEPT",
      title: "【示範】系辦短期:國際研討會接待支援",
      description: "此為示範資料。研討會期間協助報到與接待,每日彈性排班。",
    },
    {
      professorId: p2, category: "IND",
      title: "【示範】產學跨域:語音技術使用者研究",
      description: "此為示範資料。與業界合作之語音介面易用性研究,需簽保密承諾。",
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

  console.log("✓ 種子資料建立完成");
}

main().catch((e) => { console.error(e); process.exit(1); });
