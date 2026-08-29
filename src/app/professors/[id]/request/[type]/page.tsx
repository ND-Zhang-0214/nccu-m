import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@/server/auth";
import { getProfessor } from "@/server/repositories/professors";
import { getIntakeSetting } from "@/server/repositories/student-requests";
import { REQUEST_TYPES, INTAKE_TYPES_WITH_REQUEST_FORM, type IntakeType } from "@/shared/categories";
import { RequestForm } from "../request-form";

export const dynamic = "force-dynamic";

export default async function RequestFormPage({ params }: { params: { id: string; type: string } }) {
  if (!INTAKE_TYPES_WITH_REQUEST_FORM.includes(params.type)) notFound();
  const type = params.type as IntakeType;

  const data = await getProfessor(params.id);
  if (!data) notFound();
  const { prof } = data;

  const setting = await getIntakeSetting(params.id, type);
  const user = await currentUser();

  return (
    <>
      <nav className="crumbs">
        <Link href={`/professors/${params.id}`}>{prof.displayName}</Link>
        <span className="sep">/</span>
        <span>{REQUEST_TYPES[type]}</span>
      </nav>
      <h1>向 {prof.displayName} 提出:{REQUEST_TYPES[type]}</h1>

      {!setting?.enabled ? (
        <div className="notice">
          此教授目前未開放「{REQUEST_TYPES[type]}」的請求。
          <br /><Link href={`/professors/${params.id}`}>返回教授頁面</Link>
        </div>
      ) : (
        <>
          {setting.conditionText && (
            <div className="notice" style={{ marginBottom: 16 }}>
              <strong>教授設定的條件</strong><br />{setting.conditionText}
              {setting.quotaNote && <><br /><span className="lede" style={{ fontSize: 13 }}>名額:{setting.quotaNote}</span></>}
            </div>
          )}
          {user ? (
            <RequestForm professorId={params.id} type={type} />
          ) : (
            <div className="notice">請先<Link href="/login">以校內信箱登入</Link>,才能送出請求。</div>
          )}
        </>
      )}
    </>
  );
}
