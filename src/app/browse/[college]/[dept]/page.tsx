import Link from "next/link";
import { notFound } from "next/navigation";
import { getDepartmentTree } from "@/server/repositories/taxonomy";

export const dynamic = "force-dynamic";

export default async function DeptPage({ params }: { params: { college: string; dept: string } }) {
  const data = await getDepartmentTree(params.college, params.dept);
  if (!data) notFound();
  return (
    <>
      <nav className="crumbs">
        <Link href="/browse">全部學院</Link>
        <span className="sep">/</span>
        <Link href={`/browse/${data.college.slug}`}>{data.college.name}</Link>
        <span className="sep">/</span>
        <span>{data.dept.name}</span>
      </nav>
      <h1>{data.dept.name}</h1>

      {data.fields.length === 0 ? (
        <div className="notice">此系所的研究領域尚未建檔。領域資料由各系陸續補充,建檔方式見專案 README。</div>
      ) : (
        data.fields.map((f) => (
          <section className="field-block" key={f.id}>
            <h3><span className="tier">域</span>{f.name}</h3>
            <div className="chiprow">
              {f.subfields.map((s) => (
                <Link key={s.id} className="chip" href={`/subfields/${s.id}`}>{s.name}</Link>
              ))}
            </div>
          </section>
        ))
      )}

      <h2>本系教授</h2>
      {data.professors.length === 0 ? (
        <p className="lede">尚無教授建檔。</p>
      ) : (
        <ul className="catalog">
          {data.professors.map((p) => (
            <li key={p.id}>
              <Link href={`/professors/${p.id}`}>
                <span>{p.displayName}</span>
                <span className="count">{p.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
