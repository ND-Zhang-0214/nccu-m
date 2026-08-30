import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfessor } from "@/server/repositories/professors";
import { CATEGORIES } from "@/server/repositories/postings";
import { guardAgainstScraping } from "@/server/anti-scrape";
import { currentUser } from "@/server/auth";
import { getIntakeSettingsForProfessor } from "@/server/repositories/student-requests";
import { REQUEST_TYPES, INTAKE_TYPES_WITH_REQUEST_FORM } from "@/shared/categories";
import { blockUnitFromDirectory } from "@/server/authz";

export const dynamic = "force-dynamic";

export default async function ProfessorPage({ params }: { params: { id: string } }) {
  await blockUnitFromDirectory(); // 白皮書2.5.2:單位帳號不可瀏覽教授資料
  await guardAgainstScraping("PROFESSOR", params.id, `/professors/${params.id}`);
  const data = await getProfessor(params.id);
  if (!data) notFound();
  const { prof, dept, college, specialties, openPostings } = data;
  const user = await currentUser();
  const intakeSettings = (await getIntakeSettingsForProfessor(params.id))
    .filter((s) => s.enabled && INTAKE_TYPES_WITH_REQUEST_FORM.includes(s.type));
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

      {/* 白皮書 2.3.1:教授在個人檔案設定的五項開關,學生在此頁即可看見,無需詢問即知是否符合資格 */}
      <h2>可提出的請求</h2>
      {intakeSettings.length === 0 ? (
        <p className="lede">此教授目前未開放任何學生主動請求項目(如推薦信、大專生計畫等)。</p>
      ) : user ? (
        <ul className="catalog">
          {intakeSettings.map((s) => (
            <li key={s.type}>
              <Link href={`/professors/${params.id}/request/${s.type}`}>
                <span>{REQUEST_TYPES[s.type]}{s.conditionText && <span className="lede" style={{ marginLeft: 8, fontSize: 12.5 }}>{s.conditionText}</span>}</span>
                {s.quotaNote && <span className="count">{s.quotaNote}</span>}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="notice">
          此教授開放 {intakeSettings.map((s) => REQUEST_TYPES[s.type]).join("、")} 等請求。
          <Link href="/login">以校內信箱登入</Link>後可查看條件並提出請求。
        </div>
      )}
    </>
  );
}
