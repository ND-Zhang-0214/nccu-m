"use client";
import { useFormState, useFormStatus } from "react-dom";
import { updateDisplayNameAction } from "@/app/actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button className="secondary" disabled={pending}>{pending ? "更新中…" : "更新顯示名稱"}</button>;
}

export function DisplayNameForm({ currentName }: { currentName: string }) {
  const [state, action] = useFormState(updateDisplayNameAction, null as any);
  return (
    <form className="stack" action={action}>
      <input name="displayName" defaultValue={currentName} maxLength={60} required />
      <p><Submit /></p>
      {state?.error && <div className="notice">{state.error}</div>}
      {state?.ok && <div className="notice ok">已更新。</div>}
    </form>
  );
}
