import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePostingHistoryViewer } from "@/server/authz";
import { getPosting, getPostingVersions } from "@/server/repositories/postings";

export const dynamic = "force-dynamic";

export default async function PostingHistoryPage({ params }: { params: { id: string } }) {
  await requirePostingHistoryViewer(params.id);
  const posting = await getPosting(params.id);
  if (!posting) notFound();
  const versions = await getPostingVersions(params.id);

  return (
    <>
      <nav className="crumbs">
        <Link href={`/postings/${posting.id}`}>{posting.title}</Link>
        <span className="sep">/</span>
        <span>編輯歷史</span>
      </nav>
      <h1>編輯歷史</h1>
      <p className="lede" style={{ fontSize: 13.5 }}>
        白皮書 2.8.2:完整編輯歷史僅開放給此需求的發布者、已提出申請者與管理員查看;一般瀏覽者只會看到目前內容。
        以下每一筆是「編輯前」的快照,由新到舊排列;目前版本為第 {posting.currentVersion} 版。
      </p>
      {versions.length === 0 ? (
        <p className="lede">此需求自發布以來尚未被編輯過,沒有歷史快照。</p>
      ) : (
        <ul className="catalog">
          {versions.map((v) => (
            <li key={v.id} style={{ padding: "14px 16px" }}>
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 6 }}>
                第 {v.versionNumber} 版・{new Date(v.editedAt).toLocaleString("zh-TW")} 編輯前快照
              </div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{v.title}</div>
              <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap", color: "var(--muted)" }}>{v.description}</div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
