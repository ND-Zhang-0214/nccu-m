"use client";
import { useFormState, useFormStatus } from "react-dom";
import { createUnitAccountAction } from "@/app/actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button disabled={pending}>{pending ? "建立中…" : "建立單位帳號"}</button>;
}

export function CreateUnitForm() {
  const [state, action] = useFormState(createUnitAccountAction, null as any);
  return (
    <form className="stack" action={action}>
      <label htmlFor="name">單位名稱</label>
      <input id="name" name="name" required maxLength={100} placeholder="例:外文系系辦、職涯發展中心" />

      <label htmlFor="contactEmail">公務信箱</label>
      <input id="contactEmail" name="contactEmail" type="email" required placeholder="例:career@nccu.edu.tw" />

      <label htmlFor="extension">分機(選填,可留待日後補上)</label>
      <input id="extension" name="extension" maxLength={20} placeholder="例:12345" />

      <p><Submit /></p>
      {state?.error && <div className="notice">{state.error}</div>}
      {state?.ok && <div className="notice ok">{state.ok}</div>}
    </form>
  );
}
