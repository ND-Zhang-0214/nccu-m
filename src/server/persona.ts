// 身分視角切換(對應決策表 #9「雙儀表板」)
// 注意:persona 只影響「畫面導覽顯示哪些捷徑」,不是權限判斷依據。
// 任何一頁的實際存取權限,一律以資料庫裡的 role/擁有關係為準,不會因為 persona 切換而被繞過或限縮。
import { cookies } from "next/headers";

const COOKIE = "rm_persona";
export type Persona = "STUDENT" | "PROFESSOR";

export function getPersona(): Persona {
  const v = cookies().get(COOKIE)?.value;
  return v === "PROFESSOR" ? "PROFESSOR" : "STUDENT";
}

export function setPersonaCookie(value: Persona) {
  cookies().set(COOKIE, value, { httpOnly: false, sameSite: "lax", path: "/", maxAge: 180 * 86400 });
}
