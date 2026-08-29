// 對應決策表 #10:新手引導清單(教授端)+ #9 身分視角切換的教授視角落地頁。
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth";
import { getProfessorByUserId, getProfessorOnboarding } from "@/server/repositories/professors";
import { listPostingsByProfessor, CATEGORIES } from "@/server/repositories/postings";
import { AiTagsWidget } from "./ai-tags-widget";
import { getIntakeSettingsForProfessor, listIncomingRequestsForProfessor } from "@/server/repositories/student-requests";
import { REQUEST_TYPES, REQUEST_STATUS_LABELS } from "@/shared/categories";
import { updateIntakeSettingAction, respondToRequestAction, finalizeRecommendationAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function ProfessorDashboard() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const prof = await getProfessorByUserId(user.id);
  if (!prof) {
    return (
      <>
        <h1>教授儀表板</h1>
        <div className="notice">此帳號尚未連結教授檔案,無法使用教授儀表板。如果你是教授本人,請聯絡管理員完成帳號認領。</div>
      </>
    );
  }

  const onboarding = await getProfessorOnboarding(prof.id);
  const steps = [
    { done: onboarding.hasBio, label: "完成檔案簡介" },
    { done: onboarding.hasSpecialties, label: "設定研究專長標籤" },
    { done: onboarding.hasPosting, label: "發布第一則需求" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);

  const postings = await listPostingsByProfessor(prof.id);
  const intakeSettings = await getIntakeSettingsForProfessor(prof.id);
  const incomingRequests = await listIncomingRequestsForProfessor(prof.id);
  const pendingCount = incomingRequests.filter((r) => ["pending", "wants_to_talk", "writing"].includes(r.status)).length;

  return (
    <>
      <h1>教授儀表板</h1>
      <p className="lede">{prof.displayName}・{prof.verifyStatus === "APPROVED" ? "已核准" : prof.verifyStatus}</p>

      {doneCount < steps.length && (
        <div className="onboarding-box">
          <strong>新手引導({doneCount}/{steps.length})</strong>
          <div className="progress-bar"><div className="progress-bar-fill" style={{ width: `${pct}%` }} /></div>
          <ul className="checklist">
            {steps.map((s) => (
              <li key={s.label} className={s.done ? "done" : ""}>
                <span className="check-icon">{s.done ? "✓" : ""}</span>
                <span className="label">{s.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2>研究專長標籤</h2>
      <p className="lede" style={{ fontSize: 13.5 }}>
        AI 依你的檔案簡介建議標籤,點擊後才會實際加入,不會自動套用。
      </p>
      <AiTagsWidget professorId={prof.id} />

      <p style={{ marginTop: 24 }}>
        <Link href="/groups">我的研究團隊群組 →</Link>
      </p>

      <h2>我發布的需求({postings.length})</h2>
      <p style={{ marginTop: -8 }}><Link href="/postings/new">+ 發布新需求</Link></p>
      {postings.length === 0 ? (
        <p className="lede">還沒有發布任何需求。</p>
      ) : (
        <ul className="catalog">
          {postings.map((p) => (
            <li key={p.id}>
              <Link href={`/postings/${p.id}/applications`}>
                <span>{p.title}</span>
                <span className="badge cat">{CATEGORIES[p.category]}</span>
                <span className="count">{p.isOpen ? "開放中" : "已關閉"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* 白皮書 2.3.1:可受理的學生請求設定區。五項開關由同一支 action 帶不同 type 參數處理。 */}
      <h2>可受理的學生請求</h2>
      <p className="lede" style={{ fontSize: 13.5 }}>
        開啟後,學生會在你的教授頁面看到此項目並可直接提出請求,無須先私下詢問是否受理。
      </p>
      {intakeSettings.map((s) => (
        <div key={s.type} className="intake-row">
          <form action={updateIntakeSettingAction}>
            <input type="hidden" name="type" value={s.type} />
            <div className="intake-head">
              <input type="checkbox" id={`enabled-${s.type}`} name="enabled" defaultChecked={s.enabled} />
              <strong>{REQUEST_TYPES[s.type]}</strong>
            </div>
            {s.type === "COLLAB_GUIDE" && (
              <p className="intake-note">此開關將於「學生合作專區」模組上線後才會有學生端請求入口,目前僅供先行設定。</p>
            )}
            <div className="intake-fields">
              <label htmlFor={`cond-${s.type}`} style={{ fontSize: 12.5, color: "var(--muted)" }}>條件文字(學生會看到)</label>
              <input id={`cond-${s.type}`} name="conditionText" defaultValue={s.conditionText} maxLength={500}
                placeholder="例:修過我的課且成績 B+ 以上,至少需在截止日的兩週前告知" />
              <label htmlFor={`quota-${s.type}`} style={{ fontSize: 12.5, color: "var(--muted)" }}>名額(自行填寫,系統不代為計數)</label>
              <input id={`quota-${s.type}`} name="quotaNote" defaultValue={s.quotaNote} maxLength={200}
                placeholder="例:每學期 2 封(已撰寫 1 封)/ 不限制" />
            </div>
            <p style={{ marginTop: 8, marginBottom: 0 }}><button className="secondary">儲存</button></p>
          </form>
        </div>
      ))}

      {/* 白皮書 2.9:學生 → 教授請求的教授端回應介面。 */}
      <h2>收到的學生請求{pendingCount > 0 && <span className="badge cat" style={{ marginLeft: 8 }}>{pendingCount} 則待處理</span>}</h2>
      {incomingRequests.length === 0 ? (
        <p className="lede">目前還沒有收到任何請求。</p>
      ) : (
        incomingRequests.map((r) => <RequestCard key={r.id} r={r} />)
      )}
    </>
  );
}

function RequestCard({ r }: { r: Awaited<ReturnType<typeof listIncomingRequestsForProfessor>>[number] }) {
  let payload: Record<string, string> = {};
  try { payload = JSON.parse(r.payload); } catch { /* 忽略舊格式 */ }
  const FIELD_LABELS: Record<string, string> = {
    purpose: "推薦信目的", deadline: "截止日", subject: "請求信主旨", proposal: "研究構想",
    motivation: "動機與背景", availability: "可投入時間", projectName: "計畫名稱", sponsor: "計畫來源/單位", detail: "說明",
  };

  return (
    <article className="request-card">
      <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>
        {REQUEST_TYPES[r.type]}・{r.student?.displayName ?? "（未知）"}
      </h3>
      <div className="meta">
        {new Date(r.createdAt).toLocaleDateString("zh-TW")}・
        <span className={`status-pill ${r.status}`}>{REQUEST_STATUS_LABELS[r.status] ?? r.status}</span>
      </div>
      {Object.entries(payload).filter(([, v]) => v).map(([k, v]) => (
        <div key={k} className="field" style={{ fontSize: 13.5, marginBottom: 6, whiteSpace: "pre-wrap" }}>
          <b style={{ display: "block", color: "var(--muted)", fontWeight: 500, fontSize: 12 }}>{FIELD_LABELS[k] ?? k}</b>{v}
        </div>
      ))}

      {(r.status === "pending" || r.status === "wants_to_talk") && (
        <div className="request-actions">
          <form action={respondToRequestAction}>
            <input type="hidden" name="requestId" value={r.id} />
            <input type="hidden" name="decision" value="accept" />
            <button>接受</button>
          </form>
          {r.status === "pending" && (
            <form action={respondToRequestAction}>
              <input type="hidden" name="requestId" value={r.id} />
              <input type="hidden" name="decision" value="want_to_talk" />
              <button className="secondary">希望先談談</button>
            </form>
          )}
          <form action={respondToRequestAction}>
            <input type="hidden" name="requestId" value={r.id} />
            <input type="hidden" name="decision" value="decline" />
            <button className="danger">婉拒</button>
          </form>
        </div>
      )}

      {r.status === "writing" && (
        <div className="request-actions">
          <form action={finalizeRecommendationAction}>
            <input type="hidden" name="requestId" value={r.id} />
            <input type="hidden" name="outcome" value="sent" />
            <button>標記為已送出</button>
          </form>
          <form action={finalizeRecommendationAction}>
            <input type="hidden" name="requestId" value={r.id} />
            <input type="hidden" name="outcome" value="declined_after_accept" />
            <button className="danger">了解後婉拒</button>
          </form>
        </div>
      )}
    </article>
  );
}
