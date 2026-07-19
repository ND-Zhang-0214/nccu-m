import Link from "next/link";
import { notFound } from "next/navigation";
import { getSubfieldWithProfessors } from "@/server/repositories/taxonomy";

export const dynamic = "force-dynamic";

export default async function SubfieldPage({ params }: { params: { id: string } }) {
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
        data.professors.map((p) => (
          <article className="prof-card" key={p.id}>
            <h3>
              <Link href={`/professors/${p.id}`}>{p.displayName}</Link>
              {p.isOpen && <span className="badge open">開放媒合</span>}
            </h3>
            <div className="meta">{p.title}</div>
            {p.bio && <p>{p.bio}</p>}
          </article>
        ))
      )}
    </>
  );
}
