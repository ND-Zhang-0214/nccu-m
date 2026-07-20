import Link from "next/link";
import { requireUser } from "@/server/authz";
import { listConversationsForUser } from "@/server/repositories/messaging";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const user = await requireUser();
  const conversations = await listConversationsForUser(user.id);

  return (
    <>
      <h1>訊息</h1>
      {conversations.length === 0 ? (
        <p className="lede">目前沒有對話。從需求詳情頁的「開始對話」可以建立一則。</p>
      ) : (
        <ul className="catalog">
          {conversations.map(({ conv, otherUser, otherStatus, lastMsg }) => (
            <li key={conv.id}>
              <Link href={`/messages/${conv.id}`}>
                <span className={`status-dot ${otherStatus === "available" ? "open" : ""}`} />
                <span>{otherUser?.displayName ?? "（已離開的使用者）"}</span>
                <span className="count">{lastMsg ? lastMsg.body.slice(0, 24) : "尚無訊息"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
