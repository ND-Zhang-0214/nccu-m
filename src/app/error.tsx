"use client";
// §4.3 統一錯誤處理:對外只顯示一般化訊息,絕不外洩堆疊追蹤/SQL錯誤/檔案路徑。
// 詳細錯誤由 Next.js 伺服器端保留於日誌(不在此顯示),此頁面刻意不讀取 error.stack。
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="notice" style={{ margin: "60px 0" }}>
      <strong>發生錯誤</strong>
      <p>操作未能完成,請稍後再試。若持續發生,請聯絡管理員。</p>
      <button className="secondary" onClick={() => reset()}>重試</button>
    </div>
  );
}
