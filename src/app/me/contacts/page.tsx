import { requireUser } from "@/server/authz";
import { listUserContacts } from "@/server/repositories/messaging";
import { deleteContactAction } from "@/app/actions";
import { AddContactForm } from "./add-contact-form";

export const dynamic = "force-dynamic";

export default async function MyContactsPage() {
  const user = await requireUser();
  const contacts = await listUserContacts(user.id);

  return (
    <>
      <h1>我的聯絡方式</h1>
      <p className="lede">
        這裡新增的聯絡方式只有你自己看得到。只有在對話裡你主動按下「揭露」,對方才會看到——
        且每次揭露都會留下紀錄。加密儲存(§5.1),不會直接顯示在你的公開檔案上。
      </p>
      {contacts.length === 0 ? (
        <p className="lede">尚未新增任何聯絡方式。</p>
      ) : (
        <ul className="catalog">
          {contacts.map((c) => (
            <li key={c.id}>
              <span className="row">
                <strong>{c.kind}</strong>&nbsp;{c.value}
                <form action={deleteContactAction} style={{ display: "inline", marginLeft: "auto" }}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="danger">刪除</button>
                </form>
              </span>
            </li>
          ))}
        </ul>
      )}
      <h2>新增聯絡方式</h2>
      <AddContactForm />
    </>
  );
}
