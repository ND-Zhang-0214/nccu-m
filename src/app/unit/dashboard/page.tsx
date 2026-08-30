import Link from "next/link";
import { requireUser } from "@/server/authz";
import { getUnitByUserId } from "@/server/repositories/units";
import { listPostingsByUnit, CATEGORIES } from "@/server/repositories/postings";
import { CreateUnitPostingForm } from "./create-unit-posting-form";

export const dynamic = "force-dynamic";

export default async function UnitDashboard() {
  const user = await requireUser();
  const unit = await getUnitByUserId(user.id);
  if (!unit) {
    return (
      <>
        <h1>單位儀表板</h1>
        <div className="notice">此帳號尚未連結單位檔案,無法使用單位儀表板。如果你所屬的單位需要使用本平台發布職缺,請聯絡管理員建立單位帳號。</div>
      </>
    );
  }

  const postings = await listPostingsByUnit(unit.id);

  return (
    <>
      <h1>單位儀表板</h1>
      <p className="lede">{unit.name}・{unit.contactEmail}{unit.extension && `・分機 ${unit.extension}`}</p>
      <p className="lede" style={{ fontSize: 13.5 }}>
        白皮書 2.5.4:平台僅處理「公布職缺 → 投遞履歷 → 通知結果」,面試、排班、勞務契約、
        勞健保投保等後續事項,一律走校方既有工讀程序,平台不涉入。
      </p>

      <h2>發布新職缺</h2>
      <CreateUnitPostingForm />

      <h2>我發布的職缺({postings.length})</h2>
      {postings.length === 0 ? (
        <p className="lede">還沒有發布任何職缺。</p>
      ) : (
        <ul className="catalog">
          {postings.map((p) => (
            <li key={p.id}>
              <span className="row">
                <Link href={`/postings/${p.id}/applications`}>{p.title}</Link>
                <span className="badge cat">{CATEGORIES[p.category]}</span>
                <span className="count">{p.isOpen ? "開放中" : "已關閉"}</span>
                <Link href={`/postings/${p.id}`} style={{ marginLeft: 10, fontSize: 12.5 }}>編輯/管理</Link>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
