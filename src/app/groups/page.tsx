// M8 教授實驗室/計畫團隊群組。貼文一律不公開,僅群組成員可見(見架構決策)。
import Link from "next/link";
import { requireUser } from "@/server/authz";
import { listMyGroups } from "@/server/repositories/groups";
import { createGroupAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const user = await requireUser();
  const groups = await listMyGroups(user.id);

  return (
    <>
      <h1>我的研究團隊群組</h1>
      <p className="lede">群組內容僅成員可見,無公開牆、無跨群組轉發。</p>

      {groups.length === 0 ? (
        <p className="lede">你目前沒有加入任何群組。</p>
      ) : (
        <ul className="catalog">
          {groups.map((g) => (
            <li key={g.id}><Link href={`/groups/${g.id}`}>{g.name}</Link></li>
          ))}
        </ul>
      )}

      <h2>建立新群組</h2>
      <form className="stack" action={createGroupAction}>
        <label htmlFor="name">群組名稱</label>
        <input id="name" name="name" required maxLength={100} placeholder="例:句法學實驗室" />
        <label htmlFor="description">簡介(選填)</label>
        <textarea id="description" name="description" rows={3} maxLength={500} />
        <p><button>建立群組</button></p>
      </form>
    </>
  );
}
