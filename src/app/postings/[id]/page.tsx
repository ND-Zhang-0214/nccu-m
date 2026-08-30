import Link from "next/link";
import { notFound } from "next/navigation";
import { getPosting, getMyApplicationForPosting, CATEGORIES } from "@/server/repositories/postings";
import { STRUCTURED_FIELD_LABELS, COMPENSATION_TYPE_LABELS } from "@/shared/categories";
import { requireUser } from "@/server/authz";
import { guardAgainstScraping } from "@/server/anti-scrape";
import { startConversationAction, bookSlotAction, closePostingAction, reopenPostingAction } from "@/app/actions";
import { listOpenSlotsForPosting } from "@/server/repositories/interviews";
import { listProfessorsWithIntakeEnabled } from "@/server/repositories/student-requests";
import { ApplyForm, ReportForm } from "./apply-form";

export const dynamic = "force-dynamic";

export default async function PostingPage({ params, searchParams }: { params: { id: string }; searchParams: { msgError?: string } }) {
  await guardAgainstScraping("POSTING", params.id, `/postings/${params.id}`);
  const posting = await getPosting(params.id);
  if (!posting) notFound();
  // 白皮書 2.11.4:「所有教授資料、需求內容、申請功能」一律需登入,沒有匿名預覽的中間
  // 地帶——這裡改用 requireUser() 直接把未登入訪客導去 /login(並帶 next 導回本頁),
  // 取代先前「§3.2 分級曝光」只給標題/前 40 字預覽的做法(與 2.11.4 的白名單牴觸,已在
  // middleware.ts 的註解說明)。下面因此可以把一堆 `user &&` / `user ? … : …` 的分支
  // 拿掉——requireUser() 保證 user 一定存在,不會是 null。
  const user = await requireUser();
  const isOwner = posting.posterUserId === user.id || user.role === "ADMIN";
  const myApplication = !isOwner ? await getMyApplicationForPosting(params.id, user.id) : null;

  // 白皮書 2.6.4:合作專區勾選「需要教授指導」後,列出已開啟「指導學生合作專案」開關的教授。
  let structuredFields: Record<string, unknown> = {};
  try { structuredFields = JSON.parse(posting.structuredFields || "{}"); } catch { /* 忽略壞資料 */ }
  const needsGuidance = posting.posterType === "STUDENT" && structuredFields.needsProfessorGuidance === true;
  const guidanceProfessors = needsGuidance ? await listProfessorsWithIntakeEnabled("COLLAB_GUIDE") : [];

  // 補齊先前的缺口:UNIT/GRAD_HELPER/STUDENT_COLLAB 發布時蒐集的結構化欄位(時薪、工時、
  // 勞健保、聯繫方式、報酬形式、截止日等)先前只寫進 DB,詳情頁從未顯示給瀏覽者看。
  const structuredEntries = Object.entries(structuredFields).filter(
    ([k, v]) => k !== "needsProfessorGuidance" && v !== undefined && v !== null && v !== "",
  ) as [string, string | number | boolean][];

  // 白皮書 2.8.3:已關閉的需求「不可真刪除」,但只保留給發布者/申請者/管理員查詢——
  // 一般瀏覽者一律視為不存在,不會因為知道直接連結就能繞過「已從列表下架」的意圖。
  if (!posting.isOpen && !isOwner && !myApplication) notFound();

  return (
    <>
      <nav className="crumbs">
        <Link href="/postings">開放需求</Link>
        <span className="sep">/</span>
        <span>{CATEGORIES[posting.category]}</span>
      </nav>
      <h1>
        {posting.title}
        <span className="badge cat">{CATEGORIES[posting.category]}</span>
        {!posting.isOpen && <span className="badge">已關閉</span>}
      </h1>
      <p className="lede">
        發布者:{posting.posterHref ? (
          <Link href={posting.posterHref}>{posting.posterName}</Link>
        ) : posting.posterName}
        {posting.professor && `・${posting.professor.title}`}
      </p>
      {!posting.isOpen && (
        <div className="notice">
          此需求已關閉{posting.closedReason && `(${posting.closedReason})`},僅發布者、已提出申請者與管理員可查詢,不會出現在開放需求列表中。
        </div>
      )}
      <p style={{ whiteSpace: "pre-wrap" }}>{posting.description}</p>
      {structuredEntries.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>詳細資訊</div>
          {structuredEntries.map(([k, v]) => (
            <div key={k} style={{ fontSize: 13.5, marginBottom: 8, whiteSpace: "pre-wrap" }}>
              <b style={{ display: "block", color: "var(--muted)", fontWeight: 500, fontSize: 12 }}>
                {STRUCTURED_FIELD_LABELS[k] ?? k}
              </b>
              {k === "compensationType" ? (COMPENSATION_TYPE_LABELS[String(v)] ?? String(v)) : String(v)}
            </div>
          ))}
        </div>
      )}

      {searchParams.msgError && <div className="notice">{searchParams.msgError}</div>}

      {needsGuidance && (
        <div className="notice">
          <strong>此邀集希望能有教授指導</strong>
          {guidanceProfessors.length === 0 ? (
            <>・目前還沒有教授開啟「指導學生合作專案」這項受理設定,可以先私訊發起人討論。</>
          ) : (
            <div style={{ marginTop: 8 }}>
              以下教授已開啟「指導學生合作專案」受理設定,可直接提出請求(白皮書 2.6.4,走與推薦信相同的請求流程):
              <ul className="catalog" style={{ marginTop: 8 }}>
                {guidanceProfessors.map((p) => (
                  <li key={p.id}>
                    <Link href={`/professors/${p.id}/request/COLLAB_GUIDE`}>
                      <span>{p.displayName}</span>
                      <span className="count">{p.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {isOwner && (
        <div className="notice ok">
          你是這則需求的發布者。<Link href={`/postings/${posting.id}/applications`}>查看並排比較所有申請 →</Link>
          <div style={{ marginTop: 8 }}>
            <Link href={`/postings/${posting.id}/edit`}>編輯需求</Link>
            {" · "}
            <Link href={`/postings/${posting.id}/history`}>查看編輯歷史</Link>
            {posting.isOpen ? (
              <form action={closePostingAction} style={{ display: "inline-block", marginLeft: 10 }}>
                <input type="hidden" name="postingId" value={posting.id} />
                <button className="danger" style={{ fontSize: 12.5, padding: "4px 10px" }}>關閉此需求</button>
              </form>
            ) : (
              <form action={reopenPostingAction} style={{ display: "inline-block", marginLeft: 10 }}>
                <input type="hidden" name="postingId" value={posting.id} />
                <button className="secondary" style={{ fontSize: 12.5, padding: "4px 10px" }}>重新開放</button>
              </form>
            )}
          </div>
        </div>
      )}

      {myApplication && (
        <div className="notice ok">
          你已申請此需求。
          <form action={startConversationAction} style={{ display: "inline" }}>
            <input type="hidden" name="applicationId" value={myApplication.id} />
            <button className="secondary" style={{ marginLeft: 8 }}>開始對話</button>
          </form>
        </div>
      )}

      {myApplication && (await (async () => {
        const slots = await listOpenSlotsForPosting(posting.id);
        if (slots.length === 0) return null;
        return (
          <>
            <h2>預約面試時段</h2>
            <p className="lede" style={{ fontSize: 13.5 }}>地點資訊將於預約後顯示。</p>
            <ul className="catalog">
              {slots.map((s) => (
                <li key={s.id}>
                  <span className="row">
                    {new Date(s.startAt).toLocaleString("zh-TW")}
                    <form action={bookSlotAction} style={{ marginLeft: "auto" }}>
                      <input type="hidden" name="slotId" value={s.id} />
                      <input type="hidden" name="applicationId" value={myApplication.id} />
                      <button className="secondary">預約</button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          </>
        );
      })())}

      {posting.isOpen ? (
        <>
          <h2>提出申請</h2>
          <ApplyForm postingId={posting.id} category={posting.category} />
        </>
      ) : (
        !isOwner && <div className="notice" style={{ marginTop: 24 }}>此需求已關閉,無法再提出新申請。</div>
      )}
      <ReportForm targetType="POSTING" targetId={posting.id} />
    </>
  );
}
