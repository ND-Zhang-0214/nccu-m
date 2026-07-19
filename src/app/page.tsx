import Link from "next/link";
import { listColleges } from "@/server/repositories/taxonomy";
import { listOpenPostings, CATEGORIES } from "@/server/repositories/postings";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [colleges, postings] = await Promise.all([listColleges(), listOpenPostings()]);
  return (
    <>
      <h1>把研究需求與人才,放進同一份目錄</h1>
      <p className="lede">
        教授的研究助理需求、大專生計畫、推薦信申請與跨域合作,目前散落在各個管道。
        這裡把它們整理成一份可以逐層翻閱的校內目錄——從學院到學系,從領域到子領域,再到每一位教授。
      </p>
      <p>
        <Link className="btn" href="/browse">開始瀏覽:{colleges.length} 個學院</Link>
      </p>

      <h2>最新開放需求</h2>
      <ul className="catalog">
        {postings.slice(0, 5).map((p) => (
          <li key={p.id}>
            <Link href={`/postings/${p.id}`}>
              <span>{p.title}</span>
              <span className="badge cat">{CATEGORIES[p.category]}</span>
              <span className="count">{p.professor.displayName}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
