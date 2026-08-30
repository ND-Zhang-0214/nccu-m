import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePostingOwner } from "@/server/authz";
import { getPosting } from "@/server/repositories/postings";
import { EditPostingForm } from "./edit-posting-form";

export const dynamic = "force-dynamic";

export default async function EditPostingPage({ params }: { params: { id: string } }) {
  await requirePostingOwner(params.id);
  const posting = await getPosting(params.id);
  if (!posting) notFound();

  return (
    <>
      <nav className="crumbs">
        <Link href={`/postings/${posting.id}`}>{posting.title}</Link>
        <span className="sep">/</span>
        <span>編輯</span>
      </nav>
      <h1>編輯需求</h1>
      <p className="lede" style={{ fontSize: 13.5 }}>
        白皮書 2.8.1:發布後仍可編輯,但每次修改都會保留「編輯前」的完整快照(見
        {" "}<Link href={`/postings/${posting.id}/history`}>編輯歷史</Link>),已提出申請者的申請會留住他們申請當下看到的版本,不會被你之後的修改覆蓋。
      </p>
      <p className="lede" style={{ fontSize: 12.5, marginTop: -8 }}>
        誠實標註簡化:目前編輯僅開放標題與說明兩個通用欄位;結構化欄位(如單位職缺的薪資、工時等)若需要調整,
        目前設計上請改用「關閉此需求」後重新發布,尚未支援逐欄位編輯。
      </p>
      <EditPostingForm postingId={posting.id} title={posting.title} description={posting.description} />
    </>
  );
}
