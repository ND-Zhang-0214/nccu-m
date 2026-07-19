import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth";
import { listNotifications } from "@/server/repositories/notifications";
import { markNotificationsReadAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
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
          {items.map((n) => (
            <li key={n.id}>
              <Link href={n.link || "#"} className="row" style={{ display: "block", padding: "13px 16px" }}>
                <div style={{ fontWeight: n.isRead ? 400 : 700 }}>{n.title}</div>
                {n.body && <div className="lede" style={{ margin: "4px 0 0", fontSize: 13.5 }}>{n.body}</div>}
                <div className="lede" style={{ margin: "4px 0 0", fontSize: 12 }}>
                  {new Date(n.createdAt).toLocaleString("zh-TW")}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
