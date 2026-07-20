import { requireGroupMember } from "@/server/authz";
import { getGroup, listGroupMembers, listPosts } from "@/server/repositories/groups";
import { inviteMemberAction, createGroupPostAction } from "@/app/actions";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function GroupDetailPage({ params }: { params: { id: string } }) {
  const user = await requireGroupMember(params.id);
  const group = await getGroup(params.id);
  if (!group) notFound();
  const [members, posts] = await Promise.all([listGroupMembers(params.id), listPosts(params.id)]);
  const isOwner = group.ownerId === user.id;

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
