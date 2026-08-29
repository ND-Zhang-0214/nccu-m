"use client";
// 白皮書 2.1 二維模型「教授/單位 → 學生」發布入口(2026-08 新增:先前版本沒有此表單,只有種子資料)。
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createPostingAction } from "@/app/actions";
import { PROFESSOR_CATEGORIES } from "@/shared/categories";

function Submit() {
  const { pending } = useFormStatus();
  return <button disabled={pending}>{pending ? "發布中…" : "發布需求"}</button>;
}

const CATEGORY_HINT: Record<string, string> = {
  TA: "課堂助教工作,通常對應特定學期的課程。",
  RA: "支援研究計畫的長期或短期人力需求。",
  LAB: "招募加入實驗室成員或指導畢業專題的學生。",
  EXT: "有名額時公布的校外計畫指導機會(如學海築夢、TOP1000)。",
};

export function CreatePostingForm() {
  const [state, action] = useFormState(createPostingAction, null as any);
  const [category, setCategory] = useState("TA");

  return (
    <form className="stack" action={action}>
      <label htmlFor="category">類別</label>
      <select id="category" name="category" value={category} onChange={(e) => setCategory(e.target.value)}>
        {Object.entries(PROFESSOR_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <p className="lede" style={{ marginTop: -6, fontSize: 13 }}>{CATEGORY_HINT[category]}</p>

      <label htmlFor="title">標題</label>
      <input id="title" name="title" required minLength={4} maxLength={200} placeholder="例:語言學概論 課程助教(114-1)" />

      <label htmlFor="description">需求說明(至少 20 字)</label>
      <textarea id="description" name="description" rows={8} required minLength={20} maxLength={5000}
        placeholder="條件、名額、工作內容、截止日等,建議寫清楚以減少重複詢問。" />

      <p><Submit /></p>
      {state?.error && <div className="notice">{state.error}</div>}
    </form>
  );
}
