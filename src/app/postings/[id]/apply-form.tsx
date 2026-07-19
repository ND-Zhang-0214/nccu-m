"use client";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { applyAction, reportAction } from "@/app/actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button disabled={pending}>{pending ? "送出中…" : label}</button>;
}

export function ApplyForm({ postingId, category }: { postingId: string; category: string }) {
  const [state, action] = useFormState(applyAction, null as any);
  return (
    <form className="stack" action={action}>
      <input type="hidden" name="postingId" value={postingId} />
      <label htmlFor="motivation">申請動機(必填,至少 20 字)</label>
      <textarea id="motivation" name="motivation" rows={6} required minLength={20}
        placeholder="說明你的相關背景、興趣與可投入時間。" />
      {category === "TA" && (
        <>
          <label htmlFor="payload">補充資料(選填):相關成績與技能</label>
          <textarea id="payload-raw" rows={2} placeholder="例:語概 A、會使用 Praat"
            onChange={(e) => {
              const el = document.getElementById("payload") as HTMLInputElement;
              el.value = JSON.stringify({ note: e.target.value });
            }} />
        </>
      )}
      {category === "REC" && (
        <>
          <label htmlFor="payload">補充資料(選填):申請單位與截止日</label>
          <textarea id="payload-raw" rows={2} placeholder="例:某大學語言學研究所,12/15 截止"
            onChange={(e) => {
              const el = document.getElementById("payload") as HTMLInputElement;
              el.value = JSON.stringify({ note: e.target.value });
            }} />
        </>
      )}
      <input type="hidden" id="payload" name="payload" defaultValue="{}" />
      <p><Submit label="送出申請" /></p>
      {state?.error && (
        <div className="notice">
          {state.error}
          {state.needTerms && <> <Link href="/terms">前往簽署條款</Link></>}
        </div>
      )}
      {state?.ok && <div className="notice ok">{state.ok}</div>}
    </form>
  );
}

export function ReportForm({ targetType, targetId }: { targetType: string; targetId: string }) {
  const [state, action] = useFormState(reportAction, null as any);
  return (
    <details style={{ marginTop: 32 }}>
      <summary style={{ cursor: "pointer", color: "var(--muted)", fontSize: 14 }}>檢舉此內容</summary>
      <form className="stack" action={action}>
        <input type="hidden" name="targetType" value={targetType} />
        <input type="hidden" name="targetId" value={targetId} />
        <label htmlFor="reason">檢舉理由(至少 10 字)</label>
        <textarea id="reason" name="reason" rows={3} required minLength={10} />
        <p><Submit label="送出檢舉" /></p>
        {state?.error && <div className="notice">{state.error}</div>}
        {state?.ok && <div className="notice ok">{state.ok}</div>}
      </form>
    </details>
  );
}
