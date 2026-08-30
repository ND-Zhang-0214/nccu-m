import Link from "next/link";
import { requireAdmin } from "@/server/authz";
import { listUnits } from "@/server/repositories/units";
import { CreateUnitForm } from "./create-unit-form";

export const dynamic = "force-dynamic";

export default async function AdminUnitsPage() {
  await requireAdmin("/admin/units");
  const units = await listUnits();

  return (
    <>
      <nav className="crumbs">
        <Link href="/admin">管理後台</Link>
        <span className="sep">/</span>
        <span>單位帳號管理</span>
      </nav>
      <h1>單位帳號管理</h1>
      <p className="lede" style={{ fontSize: 13.5 }}>
        白皮書 2.5.1:單位帳號的註冊信箱需先經管理員審核與分類、以清單呈現。下方建立後,
        該公務信箱即可直接以現行的校內信箱驗證碼流程登入,不需要再另外設定密碼。
      </p>

      <h2>新增單位帳號</h2>
      <CreateUnitForm />

      <h2>目前的單位帳號({units.length})</h2>
      {units.length === 0 ? (
        <p className="lede">目前還沒有任何單位帳號。</p>
      ) : (
        <ul className="catalog">
          {units.map((u) => (
            <li key={u.id}>
              <span className="row">
                <span>{u.name}</span>
                <span className="count">{u.contactEmail}{u.extension && `・分機 ${u.extension}`}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
