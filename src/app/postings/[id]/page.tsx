import Link from "next/link";
import { notFound } from "next/navigation";
import { getPosting, getMyApplicationForPosting, CATEGORIES } from "@/server/repositories/postings";
import { currentUser } from "@/server/auth";
import { guardAgainstScraping } from "@/server/anti-scrape";
import { startConversationAction } from "@/app/actions";
import { ApplyForm, ReportForm } from "./apply-form";

export const dynamic = "force-dynamic";

export default async function PostingPage({ params, searchParams }: { params: { id: string }; searchParams: { msgError?: string } }) {
  await guardAgainstScraping("POSTING", params.id, `/postings/${params.id}`);
  const posting = await getPosting(params.id);
  if (!posting) notFound();
  const user = await currentUser();
  const isOwner = !!user && (posting.professor.userId === user.id || user.role === "ADMIN");
  const myApplication = user && !isOwner ? await getMyApplicationForPosting(params.id, user.id) : null;
  return (
    <>
      <nav className="crumbs">
        <Link href="/postings">開放需求</Link>
        <span className="sep">/</span>
        <span>{CATEGORIES[posting.category]}</span>
      </nav>
      <h1>{posting.title}<span className="badge cat">{CATEGORIES[posting.category]}</span></h1>
      <p className="lede">
        發布者:<Link href={`/professors/${posting.professorId}`}>{posting.professor.displayName}</Link>
        ・{posting.professor.title}
      </p>
      {/* §3.2 分級曝光:需求全文需登入才顯示,免登入僅見標題/分類/發布者(已在上方) */}
      {user ? (
        <p style={{ whiteSpace: "pre-wrap" }}>{posting.description}</p>
      ) : (
        <div className="notice">
          {posting.description.slice(0, 40)}……
          <br />完整內容請<Link href="/login">以校內信箱登入</Link>後查看。
        </div>
      )}

      {searchParams.msgError && <div className="notice">{searchParams.msgError}</div>}

      {isOwner && (
        <div className="notice ok">
          你是這則需求的發布者。<Link href={`/postings/${posting.id}/applications`}>查看並排比較所有申請 →</Link>
        </div>
      )}

      {myApplication && (
        <div className="notice ok">
          你已申請此需求。
          <form action={startConversationAction} style={{ display: "inline" }}>
            <input type="hidden" name="applicationId" value={myApplication.id} />
            <button className="secondary" style={{ marginLeft: 8 }}>開始對話</button>
          </form>
        </div>
      )}

      <h2>提出申請</h2>
      {user ? (
        <ApplyForm postingId={posting.id} category={posting.category} />
      ) : (
        <div className="notice">請先<Link href="/login">以校內信箱登入</Link>,才能提出申請。</div>
      )}
      {user && <ReportForm targetType="POSTING" targetId={posting.id} />}
    </>
  );
}
