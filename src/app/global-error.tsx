"use client";
// 根版面本身出錯時的最後防線,同樣不外洩任何錯誤細節。
export default function GlobalError() {
  return (
    <html lang="zh-Hant-TW">
      <body style={{ fontFamily: "sans-serif", padding: 40 }}>
        <p>系統暫時無法使用,請稍後再試。</p>
      </body>
    </html>
  );
}
