"use client";
import { useFormState, useFormStatus } from "react-dom";
import { verifyDegreeLevelAction } from "@/app/actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button className="secondary" disabled={pending}>{pending ? "確認中…" : "確認學制"}</button>;
}

export function VerifyDegreeLevelForm() {
  const [state, action] = useFormState(verifyDegreeLevelAction, null as any);
  return (
    <form className="stack" action={action}>
      <input name="studentEmail" type="email" required placeholder="s1234567@g.nccu.edu.tw" />
      <p><Submit /></p>
      {state?.error && <div className="notice">{state.error}</div>}
      {state?.ok && <div className="notice ok">{state.ok}</div>}
    </form>
  );
}
