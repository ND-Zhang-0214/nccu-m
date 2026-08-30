import { requireUser } from "@/server/authz";
import { listOpenPostings } from "@/server/repositories/postings";
import { PostingsFilter } from "./postings-filter";

export const dynamic = "force-dynamic";

export default async function Postings() {
  // 白皮書 2.11.4:頁面層級複查(middleware.ts 已擋掉沒有 session cookie 的請求;這裡補
  // cookie 存在但已失效的情況,與其餘受保護頁面一致的兩層式設計)。
  await requireUser();
  const postings = await listOpenPostings();
  return (
    <>
      <h1>開放需求</h1>
      <p className="lede">點選分類即時套用篩選,不需要重新載入頁面。</p>
      <PostingsFilter postings={postings} />
    </>
  );
}
