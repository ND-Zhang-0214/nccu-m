import Link from "next/link";
import { requireUser } from "@/server/authz";
import { listOpenCollabPostings } from "@/server/repositories/postings";
import { STUDENT_COLLAB_CATEGORIES, STUDENT_COLLAB_CATEGORY_ORDER } from "@/shared/categories";

export const dynamic = "force-dynamic";

export default async function CollabZonePage() {
  // 白皮書 2.11.4:頁面層級複查。此頁先前完全沒有登入檢查,是本輪全站盤點發現的缺口
  // (與 postings/page.tsx 同一類:是「需求內容」列表,理應需登入才能瀏覽)。
  await requireUser();
  const postings = await listOpenCollabPostings();
  const byZone = new Map(STUDENT_COLLAB_CATEGORY_ORDER.map((c) => [c, postings.filter((p) => p.category === c)]));

  return (
    <>
      <h1>學生合作專區</h1>
      <p className="lede">
        學生對學生的合作邀集,發布後依類型自動歸入以下分區,各分區獨立呈現。
        {" "}<Link href="/collab/new">+ 發布合作邀集</Link>
      </p>
      <p className="lede" style={{ fontSize: 12.5 }}>
        提醒:本專區僅供揪伴與資訊媒合,不得涉及金錢募集或投資邀約,亦不得以合作邀集之名進行商業性招募(見服務條款第 6 條)。
      </p>

      {STUDENT_COLLAB_CATEGORY_ORDER.map((cat) => {
        const items = byZone.get(cat) ?? [];
        return (
          <section key={cat} style={{ marginTop: 32 }}>
            <h2>{STUDENT_COLLAB_CATEGORIES[cat]}({items.length})</h2>
            {items.length === 0 ? (
              <p className="lede" style={{ fontSize: 13.5 }}>目前這個分區還沒有邀集,成為第一個發起人吧。</p>
            ) : (
              <ul className="catalog">
                {items.map((p) => (
                  <li key={p.id}>
                    <Link href={`/postings/${p.id}`}>
                      <span>{p.title}</span>
                      <span className="count">{p.posterName}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}
