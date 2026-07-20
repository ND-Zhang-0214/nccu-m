import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfessor } from "@/server/repositories/professors";
import { CATEGORIES } from "@/server/repositories/postings";
import { guardAgainstScraping } from "@/server/anti-scrape";
import { currentUser } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function ProfessorPage({ params }: { params: { id: string } }) {
  await guardAgainstScraping("PROFESSOR", params.id, `/professors/${params.id}`);
  const data = await getProfessor(params.id);
  if (!data) notFound();
  const { prof, dept, college, specialties, openPostings } = data;
  const user = await currentUser();
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
      {/* §3.2 分級曝光:完整簡介需登入才顯示,免登入僅見已在上方公開的姓名/職稱/系所/專長標籤 */}
      {user ? (
        prof.bio && <p>{prof.bio}</p>
      ) : (
        prof.bio && <div className="notice">完整簡介需登入後查看。<Link href="/login">以校內信箱登入</Link></div>
      )}

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
