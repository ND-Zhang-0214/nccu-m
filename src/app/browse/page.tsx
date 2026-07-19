import Link from "next/link";
import { listColleges } from "@/server/repositories/taxonomy";

export const dynamic = "force-dynamic";

export default async function BrowseColleges() {
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
