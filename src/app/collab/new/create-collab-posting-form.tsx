"use client";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createStudentCollabPostingAction } from "@/app/actions";
import { STUDENT_COLLAB_CATEGORIES } from "@/shared/categories";

function Submit() {
  const { pending } = useFormStatus();
  return <button disabled={pending}>{pending ? "發布中…" : "發布合作邀集"}</button>;
}

export function CreateCollabPostingForm() {
  const [state, action] = useFormState(createStudentCollabPostingAction, null as any);
  const [category, setCategory] = useState("CLUB_RECRUIT");

  return (
    <form className="stack" action={action}>
      <label htmlFor="category">類型</label>
      <select id="category" name="category" value={category} onChange={(e) => setCategory(e.target.value)}>
        {Object.entries(STUDENT_COLLAB_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      {category === "OTHER_COLLAB" && (
        <>
          <label htmlFor="otherTypeLabel">請說明合作類型(選填)</label>
          <input id="otherTypeLabel" name="otherTypeLabel" maxLength={100} placeholder="例:攝影揪拍、讀書會" />
        </>
      )}

      <label htmlFor="title">標題</label>
      <input id="title" name="title" required minLength={4} maxLength={200} placeholder="例:語言學系迎新籌備小組招募" />

      <label htmlFor="description">詳細說明(至少 20 字)</label>
      <textarea id="description" name="description" rows={6} required minLength={20} maxLength={5000}
        placeholder="這個合作在做什麼、希望找到什麼樣的夥伴等,自由發揮。" />

      <label htmlFor="rolesNeeded">需要的角色與人數</label>
      <input id="rolesNeeded" name="rolesNeeded" required maxLength={300} placeholder="例:美宣 1 人、活動企劃 2 人" />

      <label htmlFor="deadline">截止日(到期後系統會自動關閉此邀集)</label>
      <input id="deadline" name="deadline" type="date" required />

      <label htmlFor="compensationNote">報酬/分工說明(選填)</label>
      <textarea id="compensationNote" name="compensationNote" rows={2} maxLength={500} placeholder="例:無酬,依貢獻分工;或依活動經費支給車馬費" />

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
        <input type="checkbox" name="needsProfessorGuidance" style={{ width: 16, height: 16 }} />
        需要教授指導(白皮書 2.6.4:發布後可在需求頁面看到已開啟「指導學生合作專案」的教授名單)
      </label>

      <p className="lede" style={{ fontSize: 12.5 }}>
        提醒:不得涉及金錢募集或投資邀約,亦不得以合作邀集之名進行商業性招募(服務條款第 6 條)。
      </p>

      <p><Submit /></p>
      {state?.error && <div className="notice">{state.error}</div>}
    </form>
  );
}
