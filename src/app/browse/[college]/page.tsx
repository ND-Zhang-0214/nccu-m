import Link from "next/link";
import { notFound } from "next/navigation";
import { getCollegeWithDepartments } from "@/server/repositories/taxonomy";

export const dynamic = "force-dynamic";

export default async function CollegePage({ params }: { params: { college: string } }) {
  const data = await getCollegeWithDepartments(params.college);
  if (!data) notFound();
  return (
    <>
      <nav className="crumbs">
        <Link href="/browse">全部學院</Link>
        <span className="sep">/</span>
        <span>{data.college.name}</span>
      </nav>
      <h1>{data.college.name}</h1>
      <ul className="catalog">
        {data.departments.map((d) => (
          <li key={d.id}>
            <Link href={`/browse/${data.college.slug}/${d.slug}`}>
              <span className="tier">系</span>
              <span>{d.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
