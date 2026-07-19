"use client";
// 對應決策表 #2:篩選列即時套用、不跳頁(整批資料已於伺服器端取回,篩選純在瀏覽器端進行,零網路來回)
import { useMemo, useState } from "react";
import Link from "next/link";
import { CATEGORIES } from "@/shared/categories";

type Posting = {
  id: string; title: string; category: string;
  professor: { displayName: string };
};

export function PostingsFilter({ postings }: { postings: Posting[] }) {
  const [active, setActive] = useState<string | null>(null);
  const filtered = useMemo(
    () => (active ? postings.filter((p) => p.category === active) : postings),
    [active, postings],
  );

  return (
    <>
      <div className="filter-bar">
        <button className={`filter-chip ${active === null ? "active" : ""}`} onClick={() => setActive(null)}>
          全部({postings.length})
        </button>
        {Object.entries(CATEGORIES).map(([k, v]) => {
          const count = postings.filter((p) => p.category === k).length;
          return (
            <button key={k} className={`filter-chip ${active === k ? "active" : ""}`} onClick={() => setActive(k)}>
              {v}({count})
            </button>
          );
        })}
      </div>
      <ul className="catalog" style={{ marginTop: 20 }}>
        {filtered.map((p) => (
          <li key={p.id}>
            <Link href={`/postings/${p.id}`}>
              <span>{p.title}</span>
              <span className="badge cat">{CATEGORIES[p.category]}</span>
              <span className="count">{p.professor.displayName}</span>
            </Link>
          </li>
        ))}
        {filtered.length === 0 && <li><span className="row">此分類目前沒有開放需求。</span></li>}
      </ul>
    </>
  );
}
