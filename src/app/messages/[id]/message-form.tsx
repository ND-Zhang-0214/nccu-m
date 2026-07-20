"use client";
import { useFormState, useFormStatus } from "react-dom";
import { sendMessageAction } from "@/app/actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button disabled={pending}>{pending ? "傳送中…" : "傳送"}</button>;
}

export function MessageForm({ conversationId }: { conversationId: string }) {
  const [state, action] = useFormState(sendMessageAction, null as any);
  return (
    <form className="stack" action={action} style={{ marginTop: 20 }}>
      <input type="hidden" name="conversationId" value={conversationId} />
      <textarea name="body" rows={3} required maxLength={2000} placeholder="輸入訊息…" />
      <p><Submit /></p>
      {state?.error && <div className="notice">{state.error}</div>}
    </form>
  );
}
