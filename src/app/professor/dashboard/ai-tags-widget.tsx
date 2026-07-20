"use client";
// M9 AI 輔助:AI 產生建議,教授一鍵確認後才實際套用,絕不自動寫入。
import { useFormState, useFormStatus } from "react-dom";
import { suggestTagsAction, addSpecialtyAction } from "@/app/actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button className="secondary" disabled={pending}>{pending ? "分析中…" : "AI 建議研究標籤"}</button>;
}

export function AiTagsWidget({ professorId }: { professorId: string }) {
  const [state, action] = useFormState(suggestTagsAction, { tags: [] as string[], candidateMap: {} as Record<string, string> });

  return (
    <div style={{ marginTop: 10 }}>
      <form action={action}>
        <input type="hidden" name="professorId" value={professorId} />
        <Submit />
      </form>
      {state.tags.length > 0 && (
        <div className="chiprow" style={{ marginTop: 10 }}>
          {state.tags.map((tagName) => (
            <form key={tagName} action={addSpecialtyAction}>
              <input type="hidden" name="professorId" value={professorId} />
              <input type="hidden" name="subfieldId" value={state.candidateMap?.[tagName] ?? ""} />
              <button className="chip" type="submit">+ {tagName}</button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
