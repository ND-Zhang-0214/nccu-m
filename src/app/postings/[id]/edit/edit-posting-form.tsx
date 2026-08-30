"use client";
import { useFormState, useFormStatus } from "react-dom";
import { editPostingAction } from "@/app/actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button disabled={pending}>{pending ? "儲存中…" : "儲存修改"}</button>;
}

export function EditPostingForm({ postingId, title, description }: { postingId: string; title: string; description: string }) {
  const [state, action] = useFormState(editPostingAction, null as any);
  return (
    <form className="stack" action={action}>
      <input type="hidden" name="postingId" value={postingId} />
      <label htmlFor="title">標題</label>
      <input id="title" name="title" defaultValue={title} required minLength={4} maxLength={200} />

      <label htmlFor="description">需求說明(至少 20 字)</label>
      <textarea id="description" name="description" rows={8} defaultValue={description} required minLength={20} maxLength={5000} />

      <p><Submit /></p>
      {state?.error && <div className="notice">{state.error}</div>}
      {state?.ok && <div className="notice ok">{state.ok}</div>}
    </form>
  );
}
