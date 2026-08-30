"use client";
// 白皮書 2.13:資料匯出按鈕。刻意不讓對應的 server action 直接 redirect() 到下載端點,
// 理由見 actions.ts 的 requestDataExportAction 註解——這裡改用 window.location 觸發
// 唯一一次真正的瀏覽器導覽,確保一次性連結不會被消耗兩次。
import { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { requestDataExportAction } from "@/app/actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button className="secondary" disabled={pending}>{pending ? "產生中…" : "產生我的完整資料匯出(JSON)"}</button>;
}

export function DataExportButton() {
  const [state, action] = useFormState(requestDataExportAction, null as { token?: string } | null);

  useEffect(() => {
    if (state?.token) window.location.href = `/api/export/${state.token}`;
  }, [state?.token]);

  return (
    <form action={action}>
      <p><Submit /></p>
    </form>
  );
}
