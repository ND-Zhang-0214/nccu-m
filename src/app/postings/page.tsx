import { listOpenPostings } from "@/server/repositories/postings";
import { PostingsFilter } from "./postings-filter";

export const dynamic = "force-dynamic";

export default async function Postings() {
  const postings = await listOpenPostings();
  return (
    <>
      <h1>開放需求</h1>
      <p className="lede">點選分類即時套用篩選,不需要重新載入頁面。</p>
      <PostingsFilter postings={postings} />
    </>
  );
}
