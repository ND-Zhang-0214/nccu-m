// 白皮書 2.5:單位帳號(系辦、職涯中心、學務處等校內單位)
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { eq } from "drizzle-orm";

export async function getUnitByUserId(userId: string) {
  const [row] = await db.select().from(t.unitProfiles).where(eq(t.unitProfiles.userId, userId));
  return row ?? null;
}

export async function getUnit(id: string) {
  const [row] = await db.select().from(t.unitProfiles).where(eq(t.unitProfiles.id, id));
  return row ?? null;
}

export async function listUnits() {
  return db.select().from(t.unitProfiles).orderBy(t.unitProfiles.name);
}

// 白皮書 2.5.1:「註冊信箱:單位公務信箱(需先審核與分類將單位以清單呈現,透過清單自動化
// 審核)」——誠實標註簡化:這裡採「管理員直接建立帳號」而不是「先建立一份已核准信箱的
// 白名單,等對方之後自己輸入信箱首次登入時才建立帳號」兩階段流程。效果等價(仍然是管理員
// 逐一審核、逐一列在清單中,示範環境的 /admin/units 本身就是那份清單),但少維護一張
// 「已核准但尚未有人登入」的中介表——對示範環境更直接,日後若要改回兩階段式也只需要在
// 這支函式前面插入一個「先寫入白名單、登入時再比對」的步驟,不影響其餘程式碼。
//
// 若該信箱已經是別種帳號(例如曾以學生身分登入過),直接把既有帳號升級為單位帳號並補上
// 單位檔案,不會產生第二個帳號——這與白皮書 2.2.5「同一信箱只對應一個帳號」的精神一致。
export async function createUnitAccount(input: { name: string; contactEmail: string; extension: string }) {
  const [existingUser] = await db.select().from(t.users).where(eq(t.users.email, input.contactEmail));
  let userId: string;
  if (existingUser) {
    if (existingUser.role === "UNIT") throw new Error("此信箱已經是單位帳號。");
    await db.update(t.users).set({ role: "UNIT" }).where(eq(t.users.id, existingUser.id));
    userId = existingUser.id;
  } else {
    const [user] = await db.insert(t.users).values({
      email: input.contactEmail, displayName: input.name, realName: input.name, role: "UNIT",
    }).returning();
    userId = user.id;
  }
  const [unit] = await db.insert(t.unitProfiles).values({
    userId, name: input.name, contactEmail: input.contactEmail, extension: input.extension,
  }).returning();
  return unit;
}
