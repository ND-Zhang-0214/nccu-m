import Link from "next/link";
import { requireAdmin } from "@/server/authz";
import { hasActiveApproval } from "@/server/repositories/dual-approval";
import { getConversationDetailForAdmin } from "@/server/repositories/messaging";
import { logSecurityEvent } from "@/server/repositories/security";
import { audit } from "@/server/repositories/audit";

export const dynamic = "force-dynamic";

export default async function AdminViewConversationPage({ params }: { params: { id: string } }) {
  const admin = await requireAdmin(`/admin/conversations/${params.id}`);

  const approved = await hasActiveApproval(admin.id, "conversation.view_messages", "CONVERSATION", params.id);
  if (!approved) {
    return (
      <>
        <h1>需要雙人核可</h1>
        <p className="lede">
          你尚未取得查看此對話的有效授權(需另一位管理員核可,且核可後 30 分鐘內有效)。
        </p>
        <p><Link href="/admin/approvals">前往申請調閱 →</Link></p>
      </>
    );
  }

  // 每一次實際查看都留下高敏感度的稽核紀錄,即使已經過雙人核可,查看本身仍要留痕
  await logSecurityEvent("admin.step_up", "medium", admin.id, "", { note: "viewed conversation via dual approval", conversationId: params.id });
  await audit(admin.id, "admin.view_conversation", "CONVERSATION", params.id);

  const detail = await getConversationDetailForAdmin(params.id);
  if (!detail) {
    return (
      <>
        <h1>對話內容(管理調閱)</h1>
        <p className="lede">找不到此對話。</p>
      </>
    );
  }

  return (
    <>
      <h1>對話內容(管理調閱)</h1>
      <div className="notice">你正在以雙人核可授權查看此對話,此次查看已留下稽核紀錄。</div>
      <p className="lede" style={{ fontSize: 13 }}>
        成員:{detail.members.map((m) => m.user?.displayName ?? "（未知使用者）").join("、")}
      </p>
      <div className="terms-box">
        {detail.messages.length === 0 ? (
          <p className="lede">此對話目前沒有訊息。</p>
        ) : (
          detail.messages.map((m) => {
            const sender = detail.members.find((mm) => mm.userId === m.senderId)?.user;
            return (
              <p key={m.id} style={{ marginBottom: 10 }}>
                <strong>{sender?.displayName ?? "（未知使用者）"}</strong>
                <span className="lede" style={{ fontSize: 11, marginLeft: 8 }}>
                  {new Date(m.createdAt).toLocaleString("zh-TW")}
                </span>
                <br />{m.body}
              </p>
            );
          })
        )}
      </div>
    </>
  );
}
