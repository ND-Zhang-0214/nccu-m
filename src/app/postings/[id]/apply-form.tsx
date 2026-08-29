"use client";
// 對應決策表 #5:申請表單改為結構化分段引導,取代單一大文字框。
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { applyAction, reportAction } from "@/app/actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button disabled={pending}>{pending ? "送出中…" : label}</button>;
}

const STEP_LABELS = ["相關背景與興趣", "可投入時間與技能", "確認並送出"];

export function ApplyForm({ postingId, category }: { postingId: string; category: string }) {
  const [state, action] = useFormState(applyAction, null as any);
  const [step, setStep] = useState(0);
  const [background, setBackground] = useState("");
  const [availability, setAvailability] = useState("");
  const [categoryNote, setCategoryNote] = useState("");

  const categoryPrompt: Record<string, string> = {
    TA: "相關成績、修過的課程、可協助批改或帶討論的能力",
    RA: "與研究相關的技能、可配合的時段、過去的研究或助理經驗",
    LAB: "對實驗室研究方向的興趣、可投入時間、相關背景",
    DEPT: "可配合的時段、曾協助過的行政工作經驗",
    EXT: "跨領域動機、與此計畫相關的作品或經驗",
  };

  const motivation =
    `【相關背景與興趣】\n${background.trim()}\n\n【可投入時間與技能】\n${availability.trim()}`.trim();
  const payload = JSON.stringify({ background, availability, categoryNote });
  const canNext0 = background.trim().length >= 15;
  const canNext1 = availability.trim().length >= 5;

  return (
    <div>
      <div className="stepper-track">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className={`stepper-dot ${i === step ? "active" : i < step ? "done" : ""}`}>
            <span className="stepper-num">{i < step ? "✓" : i + 1}</span>
            <span className="stepper-label">{label}</span>
          </div>
        ))}
      </div>

      <form className="stack" action={action}>
        <input type="hidden" name="postingId" value={postingId} />
        <input type="hidden" name="motivation" value={motivation} />
        <input type="hidden" name="payload" value={payload} />

        {step === 0 && (
          <>
            <label htmlFor="background">你的相關背景與為什麼對這個機會感興趣(至少 15 字)</label>
            <textarea id="background" rows={6} required minLength={15} value={background}
              placeholder="例:修過語言學概論與句法學,對這個題目的研究方法很有興趣，希望能實際參與資料整理與分析。"
              onChange={(e) => setBackground(e.target.value)} />
            <p><button type="button" disabled={!canNext0} onClick={() => setStep(1)}>下一步</button></p>
          </>
        )}

        {step === 1 && (
          <>
            <label htmlFor="availability">可投入時間、相關技能或經驗</label>
            <p className="lede" style={{ marginTop: -8, fontSize: 13.5 }}>
              提示:{categoryPrompt[category] ?? "可投入時數、相關技能或作品"}
            </p>
            <textarea id="availability" rows={4} required minLength={5} value={availability}
              placeholder="例:每週可投入 8 小時，會使用 R 進行語料統計。"
              onChange={(e) => setAvailability(e.target.value)} />
            <label htmlFor="categoryNote">補充資料(選填)</label>
            <textarea id="categoryNote" rows={3} value={categoryNote}
              placeholder="其他想讓教授知道的事"
              onChange={(e) => setCategoryNote(e.target.value)} />
            <p>
              <button type="button" className="secondary" onClick={() => setStep(0)}>上一步</button>{" "}
              <button type="button" disabled={!canNext1} onClick={() => setStep(2)}>下一步</button>
            </p>
          </>
        )}

        {step === 2 && (
          <>
            <div className="review-box">
              <h3>送出前確認</h3>
              <p><strong>相關背景與興趣</strong><br />{background}</p>
              <p><strong>可投入時間與技能</strong><br />{availability}</p>
              {categoryNote && <p><strong>補充資料</strong><br />{categoryNote}</p>}
            </div>
            <p>
              <button type="button" className="secondary" onClick={() => setStep(1)}>上一步</button>{" "}
              <Submit label="送出申請" />
            </p>
          </>
        )}

        {state?.error && (
          <div className="notice">
            {state.error}
            {state.needTerms && <> <Link href="/terms">前往簽署條款</Link></>}
          </div>
        )}
        {state?.ok && <div className="notice ok">{state.ok}</div>}
      </form>
    </div>
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
