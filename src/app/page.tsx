import Link from "next/link";
import { listColleges } from "@/server/repositories/taxonomy";
import { listOpenPostings, listFeaturedPostings, CATEGORIES } from "@/server/repositories/postings";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [colleges, postings] = await Promise.all([listColleges(), listOpenPostings()]);
  const latest = postings.slice(0, 3);
  const featured = await listFeaturedPostings(latest.map((p) => p.id), 4);

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
        {latest.map((p) => (
          <li key={p.id}>
            <Link href={`/postings/${p.id}`}>
              <span>{p.title}</span>
              <span className="badge cat">{CATEGORIES[p.category]}</span>
              <span className="count">{p.posterName}</span>
            </Link>
          </li>
        ))}
      </ul>

      {featured.length > 0 && (
        <>
          <h2>為你精選</h2>
          <p className="lede" style={{ marginTop: -4, fontSize: 13.5 }}>
            目前為輪替版:依最新開放需求取樣,尚未依個人興趣客製化(需要先累積瀏覽紀錄才能做到)。
          </p>
          <div className="featured-strip">
            {featured.map((p) => (
              <Link className="mini-card" href={`/postings/${p.id}`} key={p.id}>
                <div className="mini-card-name">{p.title}</div>
                <div className="mini-card-meta">
                  <span className="badge cat">{CATEGORIES[p.category]}</span> {p.professor.displayName}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
