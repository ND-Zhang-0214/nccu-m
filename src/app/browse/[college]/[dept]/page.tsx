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
        <div className="card-grid">
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
