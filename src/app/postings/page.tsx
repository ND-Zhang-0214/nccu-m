import Link from "next/link";
import { listOpenPostings, CATEGORIES } from "@/server/repositories/postings";

export const dynamic = "force-dynamic";

export default async function Postings({ searchParams }: { searchParams: { cat?: string } }) {
  const cat = searchParams.cat && CATEGORIES[searchParams.cat] ? searchParams.cat : undefined;
  const postings = await listOpenPostings(cat);
  return (
    <>
      <h1>開放需求</h1>
      <div className="chiprow">
        <Link className="chip" href="/postings">全部</Link>
        {Object.entries(CATEGORIES).map(([k, v]) => (
          <Link key={k} className="chip" href={`/postings?cat=${k}`}>{v}</Link>
        ))}
      </div>
      <ul className="catalog" style={{ marginTop: 24 }}>
        {postings.map((p) => (
          <li key={p.id}>
            <Link href={`/postings/${p.id}`}>
              <span>{p.title}</span>
              <span className="badge cat">{CATEGORIES[p.category]}</span>
              <span className="count">{p.professor.displayName}</span>
            </Link>
          </li>
        ))}
        {postings.length === 0 && <li><span className="row">此分類目前沒有開放需求。</span></li>}
      </ul>
    </>
  );
}
