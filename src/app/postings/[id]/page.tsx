import Link from "next/link";
import { notFound } from "next/navigation";
import { getPosting, CATEGORIES } from "@/server/repositories/postings";
import { currentUser } from "@/server/auth";
import { ApplyForm, ReportForm } from "./apply-form";

export const dynamic = "force-dynamic";

export default async function PostingPage({ params }: { params: { id: string } }) {
  const posting = await getPosting(params.id);
  if (!posting) notFound();
  const user = await currentUser();
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
      <p style={{ whiteSpace: "pre-wrap" }}>{posting.description}</p>

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
