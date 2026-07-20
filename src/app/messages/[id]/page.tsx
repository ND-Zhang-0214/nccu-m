import { notFound } from "next/navigation";
import { requireConversationMember } from "@/server/authz";
import { getConversationDetail, listDisclosedToMe } from "@/server/repositories/messaging";
import { listUserContacts } from "@/server/repositories/messaging";
import { setStatusAction, discloseContactAction } from "@/app/actions";
import { MessageForm } from "./message-form";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { available: "有空", away: "暫時無法回應" };

export default async function ConversationPage({ params }: { params: { id: string } }) {
  const user = await requireConversationMember(params.id);
  const detail = await getConversationDetail(params.id, user.id);
  if (!detail) notFound();
  const { me, otherUser, messages, conv } = detail;

  const [myContacts, disclosedToMe] = await Promise.all([
    listUserContacts(user.id),
    listDisclosedToMe(params.id, user.id),
  ]);

  return (
    <>
      <h1>{otherUser?.displayName ?? "（已離開的使用者）"}</h1>
      <p className="lede">
        {conv.contextType === "APPLICATION" ? "依附於一筆申請的對話" : "直接邀約對話"}
        {conv.confirmedAt && "・媒合已確認"}
      </p>

      {/* 忙碌/有空狀態:雙方各自設定,系統不做自動偵測 */}
      <div className="notice" style={{ marginBottom: 20 }}>
        <strong>你目前的狀態:</strong>
        <form action={setStatusAction} style={{ display: "inline-flex", gap: 8, marginLeft: 10, alignItems: "center" }}>
          <input type="hidden" name="conversationId" value={params.id} />
          <button name="status" value="available" className={me.status === "available" ? "" : "secondary"}>有空</button>
          <button name="status" value="away" className={me.status === "away" ? "" : "secondary"}>暫時無法回應</button>
        </form>
        <div className="lede" style={{ marginTop: 6, fontSize: 13 }}>
          對方目前狀態:{STATUS_LABEL[detail.other?.status ?? "available"]}
          {detail.other?.statusNote && `(${detail.other.statusNote})`}
        </div>
      </div>

      {/* 分層揭露:只有雙方確認合作、且本人主動按下才會揭露(架構書 §3.2) */}
      <details style={{ marginBottom: 20 }}>
        <summary style={{ cursor: "pointer" }}>聯絡方式揭露</summary>
        <div style={{ marginTop: 10 }}>
          <p className="lede" style={{ fontSize: 13.5 }}>對方揭露給你的聯絡方式:</p>
          {disclosedToMe.length === 0 ? (
            <p className="lede" style={{ fontSize: 13.5 }}>尚未揭露。</p>
          ) : (
            <ul className="catalog">
              {disclosedToMe.map((d) => (
                <li key={d.id}><span className="row">{d.kind}:{d.value}</span></li>
              ))}
            </ul>
          )}
          <p className="lede" style={{ fontSize: 13.5, marginTop: 14 }}>把你的聯絡方式揭露給對方:</p>
          {myContacts.length === 0 ? (
            <p className="lede" style={{ fontSize: 13.5 }}>你還沒有新增任何聯絡方式,可到「我的聯絡方式」新增。</p>
          ) : (
            myContacts.map((c) => (
              <form key={c.id} action={discloseContactAction} style={{ display: "inline-block", marginRight: 8 }}>
                <input type="hidden" name="conversationId" value={params.id} />
                <input type="hidden" name="contactId" value={c.id} />
                <button className="secondary">揭露 {c.kind}</button>
              </form>
            ))
          )}
        </div>
      </details>

      <div className="terms-box" style={{ maxHeight: 400, overflowY: "auto" }}>
        {messages.length === 0 ? (
          <p className="lede">還沒有訊息,開始聊聊吧。</p>
        ) : (
          messages.map((m) => (
            <p key={m.id} style={{ marginBottom: 10 }}>
              <strong>{m.senderId === user.id ? "我" : otherUser?.displayName}</strong>
              <span className="lede" style={{ fontSize: 11, marginLeft: 8 }}>
                {new Date(m.createdAt).toLocaleString("zh-TW")}
              </span>
              <br />{m.body}
            </p>
          ))
        )}
      </div>

      <MessageForm conversationId={params.id} />
    </>
  );
}
