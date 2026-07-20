"use client";
import { useFormState, useFormStatus } from "react-dom";
import { addContactAction } from "@/app/actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button disabled={pending}>{pending ? "新增中…" : "新增"}</button>;
}

export function AddContactForm() {
  const [state, action] = useFormState(addContactAction, null as any);
  return (
    <form className="stack" action={action}>
      <label htmlFor="kind">類型</label>
      <select id="kind" name="kind" defaultValue="LINE">
        <option value="LINE">Line</option>
        <option value="WEBSITE">個人網頁</option>
        <option value="OTHER">其他</option>
      </select>
      <label htmlFor="value">內容</label>
      <input id="value" name="value" required maxLength={300} placeholder="例:Line ID 或網址" />
      <p><Submit /></p>
      {state?.error && <div className="notice">{state.error}</div>}
      {state?.ok && <div className="notice ok">已新增。</div>}
    </form>
  );
}
