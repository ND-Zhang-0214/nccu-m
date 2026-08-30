"use client";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createUnitPostingAction } from "@/app/actions";
import { UNIT_CATEGORIES } from "@/shared/categories";

function Submit() {
  const { pending } = useFormStatus();
  return <button disabled={pending}>{pending ? "發布中…" : "發布職缺"}</button>;
}

export function CreateUnitPostingForm() {
  const [state, action] = useFormState(createUnitPostingAction, null as any);
  const [category, setCategory] = useState("DEPT");

  return (
    <form className="stack" action={action}>
      <label htmlFor="category">類別</label>
      <select id="category" name="category" value={category} onChange={(e) => setCategory(e.target.value)}>
        {Object.entries(UNIT_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>

      <label htmlFor="title">標題</label>
      <input id="title" name="title" required minLength={4} maxLength={200} placeholder="例:圖書館工讀生招募(114-1)" />

      <label htmlFor="description">職缺說明(至少 20 字)</label>
      <textarea id="description" name="description" rows={6} required minLength={20} maxLength={5000}
        placeholder="工作內容概述、名額等。" />

      {/* 白皮書 2.5.3:結構化必填欄位,採分開的欄位而非自由文字框,理由見 schemas.ts 註解。 */}
      <label htmlFor="wage">時薪/月薪</label>
      <input id="wage" name="wage" required maxLength={100} placeholder="例:時薪 190 元" />

      <label htmlFor="weeklyHoursAndTerm">每週工時、聘期起訖</label>
      <input id="weeklyHoursAndTerm" name="weeklyHoursAndTerm" required maxLength={200} placeholder="例:每週 8 小時,114/9/1–115/1/31" />

      <label htmlFor="laborInsurance">勞健保投保方式</label>
      <input id="laborInsurance" name="laborInsurance" required maxLength={200} placeholder="例:比照校內工讀生規定投保" />

      <label htmlFor="workLocationAndContent">工作地點、工作內容</label>
      <textarea id="workLocationAndContent" name="workLocationAndContent" rows={3} required maxLength={1000}
        placeholder="例:總圖書館 2 樓櫃檯,協助借還書與上架。" />

      <label htmlFor="qualificationRestriction">資格限制(選填,如年級、系所、修課要求;無則留空)</label>
      <input id="qualificationRestriction" name="qualificationRestriction" maxLength={200} placeholder="例:不限系所年級 / 需修過某課程" />

      <label htmlFor="contact">聯繫方式(供學生知道如何應徵)</label>
      <input id="contact" name="contact" required maxLength={200} placeholder="例:請寄履歷至 xxx@nccu.edu.tw" />

      <p className="lede" style={{ fontSize: 12.5, marginBottom: -6 }}>
        白皮書 2.5.1:每則貼文須署名承辦人姓名與分機,不可留空(供學生與稽核追蹤實際承辦人)。
      </p>
      <label htmlFor="contactPersonName">此職缺負責人姓名</label>
      <input id="contactPersonName" name="contactPersonName" required maxLength={50} placeholder="承辦人姓名" />

      <label htmlFor="staffExtension">分機</label>
      <input id="staffExtension" name="staffExtension" required maxLength={20} placeholder="例:12345" />

      <p><Submit /></p>
      {state?.error && <div className="notice">{state.error}</div>}
    </form>
  );
}
