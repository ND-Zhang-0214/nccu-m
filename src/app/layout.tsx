import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";
import { currentUser } from "@/server/auth";

export const metadata: Metadata = {
  title: "政大研究媒合平台",
  description: "校內研究媒合基礎設施:讓研究需求與人才在可驗證身分的環境中對接。",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="zh-Hant-TW">
      <body>
        <header className="site-header">
          <div className="shell">
            <Link href="/" className="brand">
              政大研究媒合平台<small>示範環境・僅含假資料</small>
            </Link>
            <nav className="nav">
              <Link href="/browse">依領域瀏覽</Link>
              <Link href="/postings">開放需求</Link>
              {user?.role === "ADMIN" && <Link href="/admin">管理後台</Link>}
              {user ? (
                <span style={{ color: "var(--muted)" }}>{user.displayName}</span>
              ) : (
                <Link href="/login">登入</Link>
              )}
            </nav>
          </div>
        </header>
        <main className="shell">{children}</main>
        <footer className="site-footer">
          <div className="shell">
            本平台為校內研究媒合之前置溝通工具,不取代任何學校正式行政程序。目前所有教授與需求皆為示範假資料。
          </div>
        </footer>
      </body>
    </html>
  );
}
