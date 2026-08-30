"use client";
// 白皮書 2.9(推薦信)/ 2.10(大專生計畫)/ 2.1(加入實驗室、請教授掛名校外計畫)
// 「學生 → 教授」結構化請求表單(2026-08 新增)。四種類型共用一支元件,依 type 切換欄位,
// 呼應白皮書 2.3.1「同一支函式帶不同參數」的技術原則。
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { submitStudentRequestAction } from "@/app/actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button disabled={pending}>{pending ? "送出中…" : "送出請求"}</button>;
}

export function RequestForm({ professorId, type }: { professorId: string; type: string }) {
  const [state, action] = useFormState(submitStudentRequestAction, null as any);

  // REC
  const [purpose, setPurpose] = useState("");
  const [deadline, setDeadline] = useState("");
  const [subject, setSubject] = useState("");
  // UR
  const [proposal, setProposal] = useState("");
  // LAB_JOIN
  const [motivation, setMotivation] = useState("");
  const [availability, setAvailability] = useState("");
  // EXT_ENDORSE
  const [projectName, setProjectName] = useState("");
  const [sponsor, setSponsor] = useState("");
  const [detail, setDetail] = useState("");
  // COLLAB_GUIDE(白皮書 2.6.4:合作專區「需要教授指導」→ 走同一套請求流程)
  const [projectSummary, setProjectSummary] = useState("");
  const [guidanceNeeded, setGuidanceNeeded] = useState("");

  const payload =
    type === "REC" ? { purpose, deadline, subject } :
    type === "UR" ? { proposal } :
    type === "LAB_JOIN" ? { motivation, availability } :
    type === "EXT_ENDORSE" ? { projectName, sponsor, detail } :
    type === "COLLAB_GUIDE" ? { projectSummary, guidanceNeeded } : {};

  return (
    <form className="stack" action={action}>
      <input type="hidden" name="professorId" value={professorId} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />

      {type === "REC" && (
        <>
          <label htmlFor="purpose">推薦信目的</label>
          <input id="purpose" required minLength={5} maxLength={300} value={purpose}
            placeholder="例:申請美國 OO 大學語言學研究所"
            onChange={(e) => setPurpose(e.target.value)} />
          <label htmlFor="deadline">截止日</label>
          <input id="deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          <label htmlFor="subject">請求信主旨(至少 15 字,含過去學經歷與希望協助的原因)</label>
          <textarea id="subject" rows={6} required minLength={15} maxLength={2000} value={subject}
            placeholder="例:修過老師的語言學概論與句法學,成績 A,希望老師能協助推薦……"
            onChange={(e) => setSubject(e.target.value)} />
        </>
      )}

      {type === "UR" && (
        <>
          <label htmlFor="proposal">初步研究構想(至少 30 字)</label>
          <textarea id="proposal" rows={8} required minLength={30} maxLength={3000} value={proposal}
            placeholder="研究題目、動機、初步想採用的方法或已具備的能力……"
            onChange={(e) => setProposal(e.target.value)} />
        </>
      )}

      {type === "LAB_JOIN" && (
        <>
          <label htmlFor="motivation">動機與相關背景(至少 15 字)</label>
          <textarea id="motivation" rows={6} required minLength={15} maxLength={2000} value={motivation}
            placeholder="為什麼想加入這個實驗室/畢業專題,有哪些相關背景……"
            onChange={(e) => setMotivation(e.target.value)} />
          <label htmlFor="availability">可投入時間(選填)</label>
          <input id="availability" maxLength={500} value={availability}
            placeholder="例:每週可投入 10 小時"
            onChange={(e) => setAvailability(e.target.value)} />
        </>
      )}

      {type === "EXT_ENDORSE" && (
        <>
          <label htmlFor="projectName">計畫名稱</label>
          <input id="projectName" required minLength={2} maxLength={200} value={projectName}
            placeholder="例:教育部學海築夢"
            onChange={(e) => setProjectName(e.target.value)} />
          <label htmlFor="sponsor">計畫來源/單位</label>
          <input id="sponsor" required minLength={2} maxLength={200} value={sponsor}
            placeholder="例:學海築夢、TOP1000 等"
            onChange={(e) => setSponsor(e.target.value)} />
          <label htmlFor="detail">說明(至少 15 字)</label>
          <textarea id="detail" rows={6} required minLength={15} maxLength={2000} value={detail}
            placeholder="計畫內容、希望老師掛名指導的原因……"
            onChange={(e) => setDetail(e.target.value)} />
        </>
      )}

      {type === "COLLAB_GUIDE" && (
        <>
          <label htmlFor="projectSummary">合作專案內容簡述(至少 15 字)</label>
          <textarea id="projectSummary" rows={6} required minLength={15} maxLength={2000} value={projectSummary}
            placeholder="這個合作專案在做什麼、目前進度、團隊組成……"
            onChange={(e) => setProjectSummary(e.target.value)} />
          <label htmlFor="guidanceNeeded">需要哪方面的指導(至少 5 字)</label>
          <textarea id="guidanceNeeded" rows={4} required minLength={5} maxLength={500} value={guidanceNeeded}
            placeholder="例:研究方法、跨領域整合、成果發表方向……"
            onChange={(e) => setGuidanceNeeded(e.target.value)} />
        </>
      )}

      <p><Submit /></p>
      {state?.error && (
        <div className="notice">
          {state.error}
          {state.needTerms && <> <Link href="/terms">前往簽署條款</Link></>}
        </div>
      )}
      {state?.ok && <div className="notice ok">{state.ok} <Link href="/me/requests">查看我的請求 →</Link></div>}
    </form>
  );
}
