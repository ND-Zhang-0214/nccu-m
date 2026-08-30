import Link from "next/link";
import { requireUser } from "@/server/authz";
import { listNotifications } from "@/server/repositories/notifications";
import { markNotificationsReadAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await listNotifications(user.id);
  const hasUnread = items.some((n) => !n.isRead);

  return (
    <>
      <h1>通知</h1>
      {hasUnread && (
        <form action={markNotificationsReadAction}>
          <p><button className="secondary">全部標為已讀</button></p>
        </form>
      )}
      {items.length === 0 ? (
        <p className="lede">目前沒有通知。</p>
      ) : (
        <ul className="catalog">
          {items.map((n) => {
            const content = (
              <>
                <div style={{ fontWeight: n.isRead ? 400 : 700 }}>{n.title}</div>
                {n.body && <div className="lede" style={{ margin: "4px 0 0", fontSize: 13.5 }}>{n.body}</div>}
                <div className="lede" style={{ margin: "4px 0 0", fontSize: 12 }}>
                  {new Date(n.createdAt).toLocaleString("zh-TW")}
                </div>
              </>
            );
            // 一次性連結(如白皮書 2.13 資料匯出的 /api/export/[token])必須是「真正的瀏覽器
            // 導覽」,不能用 next/link 的 client-side 軟導覽——實測 Next.js 對「連到非頁面路由
            // (Route Handler)」的軟導覽,失敗後會再退回觸發一次真正的硬導覽,對一次性連結
            // 等於送出兩次請求,第二次會直接拿到「已使用」。/api/ 開頭一律改用原生 <a>,
            // 保證只送出一次真正的請求;其餘站內頁面連結維持 <Link> 的軟導覽體驗。
            return (
              <li key={n.id}>
                {n.link?.startsWith("/api/") ? (
                  <a href={n.link} className="row" style={{ display: "block", padding: "13px 16px" }}>{content}</a>
                ) : (
                  <Link href={n.link || "#"} className="row" style={{ display: "block", padding: "13px 16px" }}>{content}</Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
