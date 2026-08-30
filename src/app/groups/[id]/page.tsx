import { requireGroupMember } from "@/server/authz";
import { getGroup, listGroupMembers, listPosts } from "@/server/repositories/groups";
import { listAttachmentsForGroup, sumGroupFileBytes } from "@/server/repositories/attachments";
import { GROUP_FILE_TOTAL_QUOTA } from "@/server/storage";
import { inviteMemberAction, createGroupPostAction, requestFileLinkAction, deleteGroupFileAction } from "@/app/actions";
import { GroupFileUploadWidget } from "./group-file-upload-widget";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function GroupDetailPage({ params }: { params: { id: string } }) {
  const user = await requireGroupMember(params.id);
  const group = await getGroup(params.id);
  if (!group) notFound();
  const [members, posts, files, usedBytes] = await Promise.all([
    listGroupMembers(params.id), listPosts(params.id),
    listAttachmentsForGroup(params.id), sumGroupFileBytes(params.id),
  ]);
  const isOwner = group.ownerId === user.id;
  const usedMB = (usedBytes / 1024 / 1024).toFixed(1);
  const quotaMB = GROUP_FILE_TOTAL_QUOTA / 1024 / 1024;

  return (
    <>
      <h1>{group.name}</h1>
      {group.description && <p className="lede">{group.description}</p>}

      <h2>成員({members.length})</h2>
      <ul className="catalog">
        {members.map((m) => (
          <li key={m.userId}><span className="row">{m.user?.displayName ?? "（未知）"}{m.role === "owner" && <span className="badge">擁有者</span>}</span></li>
        ))}
      </ul>
      {isOwner && (
        <form className="stack" action={inviteMemberAction} style={{ marginTop: 12 }}>
          <input type="hidden" name="groupId" value={params.id} />
          <label htmlFor="email">邀請成員(校內信箱,須已註冊)</label>
          <input id="email" name="email" type="email" required placeholder="student@g.nccu.edu.tw" />
          <p><button className="secondary">邀請</button></p>
        </form>
      )}

      {/* 白皮書 2.7.2:群組共用檔案清單,顯示上傳者與時間,成員可下載與刪除。 */}
      <h2>共用檔案區({usedMB}MB / {quotaMB}MB)</h2>
      <p className="lede" style={{ fontSize: 12.5 }}>
        單檔 5MB 內,僅接受 PDF 或圖片。每個檔案上傳滿一個月會自動刪除(到期前一週會提醒),請自行備份重要檔案(見服務條款第 7 條)。
      </p>
      {files.length === 0 ? (
        <p className="lede" style={{ fontSize: 13.5 }}>目前還沒有任何共用檔案。</p>
      ) : (
        <ul className="catalog">
          {files.map((f) => (
            <li key={f.id}>
              <span className="row">
                <span>
                  {f.originalName || "(未命名檔案)"}
                  <span className="lede" style={{ fontSize: 11.5, marginLeft: 8 }}>
                    {f.uploader?.displayName ?? "（未知）"}・{new Date(f.createdAt).toLocaleString("zh-TW")}
                    {f.expiresAt && <>・到期日 {new Date(f.expiresAt).toLocaleDateString("zh-TW")}</>}
                  </span>
                </span>
                <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <form action={requestFileLinkAction}>
                    <input type="hidden" name="attachmentId" value={f.id} />
                    <button className="secondary" style={{ fontSize: 12 }}>下載</button>
                  </form>
                  <form action={deleteGroupFileAction}>
                    <input type="hidden" name="attachmentId" value={f.id} />
                    <button className="danger" style={{ fontSize: 12 }}>刪除</button>
                  </form>
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <GroupFileUploadWidget groupId={params.id} />

      <h2>群組動態</h2>
      <form className="stack" action={createGroupPostAction}>
        <input type="hidden" name="groupId" value={params.id} />
        <textarea name="body" rows={3} required maxLength={2000} placeholder="分享進度或討論…" />
        <p><button className="secondary">發布</button></p>
      </form>
      <div className="terms-box" style={{ marginTop: 16 }}>
        {posts.length === 0 ? (
          <p className="lede">還沒有任何貼文。</p>
        ) : (
          posts.map((p) => (
            <p key={p.id} style={{ marginBottom: 12 }}>
              <strong>{p.author?.displayName ?? "（未知）"}</strong>
              <span className="lede" style={{ fontSize: 11, marginLeft: 8 }}>{new Date(p.createdAt).toLocaleString("zh-TW")}</span>
              <br />{p.body}
            </p>
          ))
        )}
      </div>
    </>
  );
}
