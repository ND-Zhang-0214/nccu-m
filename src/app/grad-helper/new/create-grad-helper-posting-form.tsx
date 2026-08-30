"use client";
import { useFormState, useFormStatus } from "react-dom";
import { createGradHelperPostingAction } from "@/app/actions";
import { COMPENSATION_TYPE_LABELS } from "@/shared/categories";

function Submit() {
  const { pending } = useFormStatus();
  return <button disabled={pending}>{pending ? "發布中…" : "發布需求"}</button>;
}

export function CreateGradHelperPostingForm() {
  const [state, action] = useFormState(createGradHelperPostingAction, null as any);

  return (
    <form className="stack" action={action}>
      <label htmlFor="title">標題</label>
      <input id="title" name="title" required minLength={4} maxLength={200} placeholder="例:碩論資料整理與文獻回顧協助" />

      <label htmlFor="description">需求說明(至少 20 字)</label>
      <textarea id="description" name="description" rows={8} required minLength={20} maxLength={5000}
        placeholder="需要協助的具體工作內容、預估時數、希望的背景或技能等。" />

      <label htmlFor="compensationType">報酬形式(白皮書 2.4.1:必須明說,不可留白)</label>
      <select id="compensationType" name="compensationType" required defaultValue="">
        <option value="" disabled>請選擇</option>
        {Object.entries(COMPENSATION_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>

      <label htmlFor="advisorName">所屬指導教授(僅作為課責對象,不需教授核准)</label>
      <input id="advisorName" name="advisorName" required maxLength={100} placeholder="教授姓名" />

      <p><Submit /></p>
      {state?.error && <div className="notice">{state.error}</div>}
    </form>
  );
}
