import Link from "next/link";
import { notFound } from "next/navigation";
import { getSubfieldWithProfessors } from "@/server/repositories/taxonomy";
import { guardAgainstScraping } from "@/server/anti-scrape";
import { blockUnitFromDirectory } from "@/server/authz";

export const dynamic = "force-dynamic";

export default async function SubfieldPage({ params }: { params: { id: string } }) {
  await blockUnitFromDirectory(); // 白皮書2.5.2:單位帳號不可瀏覽教授資料
  await guardAgainstScraping("SUBFIELD", params.id, `/subfields/${params.id}`);
  const data = await getSubfieldWithProfessors(params.id);
  if (!data) notFound();
  return (
    <>
      <nav className="crumbs">
        <Link href="/browse">全部學院</Link>
        <span className="sep">/</span>
        <Link href={`/browse/${data.college.slug}`}>{data.college.name}</Link>
        <span className="sep">/</span>
        <Link href={`/browse/${data.college.slug}/${data.dept.slug}`}>{data.dept.name}</Link>
        <span className="sep">/</span>
        <span>{data.field.name}</span>
        <span className="sep">/</span>
        <span>{data.sub.name}</span>
      </nav>
      <h1><span className="tier">類</span>{data.sub.name}</h1>
      <p className="lede">{data.college.name}・{data.dept.name}・{data.field.name}</p>

      {data.professors.length === 0 ? (
        <div className="notice">此子領域尚無教授建檔。</div>
      ) : (
        <div className="card-grid">
          <a href="/directory-index" className="bait-link" tabIndex={-1} aria-hidden="true">All Professors Index</a>
          {data.professors.map((p) => (
            <Link className="mini-card" href={`/professors/${p.id}`} key={p.id}>
              <div className="mini-card-top">
                <span className="mini-avatar">{p.displayName.slice(0, 1)}</span>
                <div>
                  <div className="mini-card-name">{p.displayName}</div>
                  <div className="mini-card-meta">{p.title}</div>
                </div>
              </div>
              <div className="mini-card-meta">
                <span className={`status-dot ${p.isOpen ? "open" : ""}`} />
                {p.isOpen ? "開放媒合" : "暫停媒合"}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
