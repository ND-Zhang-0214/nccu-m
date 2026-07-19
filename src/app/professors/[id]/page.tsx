import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfessor } from "@/server/repositories/professors";
import { CATEGORIES } from "@/server/repositories/postings";

export const dynamic = "force-dynamic";

export default async function ProfessorPage({ params }: { params: { id: string } }) {
  const data = await getProfessor(params.id);
  if (!data) notFound();
  const { prof, dept, college, specialties, openPostings } = data;
  return (
    <>
      <nav className="crumbs">
        <Link href="/browse">全部學院</Link>
        <span className="sep">/</span>
        <Link href={`/browse/${college.slug}`}>{college.name}</Link>
        <span className="sep">/</span>
        <Link href={`/browse/${college.slug}/${dept.slug}`}>{dept.name}</Link>
      </nav>
      <h1>
        {prof.displayName}
        {prof.isOpen ? <span className="badge open">開放媒合</span> : <span className="badge">暫停媒合</span>}
        {prof.verifyStatus === "SEED" && <span className="badge">示範資料</span>}
      </h1>
      <p className="lede">{prof.title}・{dept.name}</p>
      {prof.bio && <p>{prof.bio}</p>}

      <h2>研究專長</h2>
      <div className="chiprow">
        {specialties.map((s) => (
          <Link key={s.id} className="chip" href={`/subfields/${s.id}`}>{s.name}</Link>
        ))}
        {specialties.length === 0 && <span className="lede">尚未建檔</span>}
      </div>

      <h2>開放中的需求</h2>
      {openPostings.length === 0 ? (
        <p className="lede">目前沒有開放中的需求。</p>
      ) : (
        <ul className="catalog">
          {openPostings.map((p) => (
            <li key={p.id}>
              <Link href={`/postings/${p.id}`}>
                <span>{p.title}</span>
                <span className="badge cat">{CATEGORIES[p.category]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
