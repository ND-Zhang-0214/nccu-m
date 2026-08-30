import Link from "next/link";
import { listColleges } from "@/server/repositories/taxonomy";
import { blockUnitFromDirectory } from "@/server/authz";

export const dynamic = "force-dynamic";

export default async function BrowseColleges() {
  await blockUnitFromDirectory(); // 白皮書2.5.2:單位帳號不可瀏覽教授資料
  const colleges = await listColleges();
  return (
    <>
      <h1>依領域瀏覽</h1>
      <p className="lede">選擇學院後,可逐層進入學系、研究領域與子領域,找到對應的教授。</p>
      <ul className="catalog">
        {colleges.map((c) => (
          <li key={c.id}>
            <Link href={`/browse/${c.slug}`}>
              <span className="tier">院</span>
              <span>{c.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
