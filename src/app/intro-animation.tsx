"use client";
import { useCallback, useEffect, useState } from "react";

// 白皮書 2.11.1 開場動畫需求表:①播放頻率=每個工作階段僅播放一次 ②跳過=可跳過
// ③無障礙=尊重「減少動態效果」設定 ④效能=不得阻擋互動或延遲首屏。
//
// 設計取捨(誠實標註簡化):
// - 「不得阻擋互動」在這裡採取比較嚴格的解讀——不是「可以點一下跳過」就算數,而是
//   讓疊加層本身 pointer-events:none(略過按鈕除外),使用者在動畫播放的這 1.6 秒內
//   點擊/觸控頁面任何地方都會直接作用在底下的真實內容上(例如點到導覽連結會直接
//   導頁,不會被疊加層攔截、白白浪費一次點擊),同時只要偵測到任何 pointerdown/
//   keydown 就順便淡出動畫。這比多數 App 常見的「蓋一層、點哪都先關動畫」更貼近
//   字面上「不阻擋互動」的要求。
// - 「不得延遲首屏」:這個元件完全不影響 RootLayout 其餘內容的伺服器端輸出——
//   SSR/首次繪製時直接不存在任何遮罩,只有 client 端 mount 後的 effect 才會決定
//   要不要疊加播放,底下內容一開始就是完整、可互動的。
// - 用 sessionStorage(分頁工作階段)判斷「是否已播放過」,不是 localStorage(永久)
//   ——白皮書講的是「每個工作階段」,關掉分頁重開理當算新的一次。
const SESSION_KEY = "intro-animation-shown-v1";
const AUTO_DISMISS_MS = 1600;
const FADE_MS = 400;

export function IntroAnimation() {
  const [phase, setPhase] = useState<"hidden" | "visible" | "closing">("hidden");

  const close = useCallback(() => {
    setPhase((p) => (p === "visible" ? "closing" : p));
  }, []);

  useEffect(() => {
    try {
      const alreadyShown = sessionStorage.getItem(SESSION_KEY);
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      sessionStorage.setItem(SESSION_KEY, "1");
      // 無障礙:使用者已設定「減少動態效果」時,視為播放過,完全不顯示、不佔用互動。
      if (alreadyShown || reduceMotion) return;
      setPhase("visible");
    } catch {
      // sessionStorage 被瀏覽器封鎖(如嚴格隱私模式)時寧可不播放——動畫是裝飾性質,
      // 不該因為這種例外狀況影響到頁面其他功能。
    }
  }, []);

  useEffect(() => {
    if (phase !== "visible") return;
    const t = window.setTimeout(close, AUTO_DISMISS_MS);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [phase, close]);

  useEffect(() => {
    if (phase !== "closing") return;
    const t = window.setTimeout(() => setPhase("hidden"), FADE_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  if (phase === "hidden") return null;

  return (
    <div className={`intro-overlay${phase === "closing" ? " intro-overlay-out" : ""}`} aria-hidden="true">
      <div className="intro-mark">政大研究媒合平台</div>
      <button type="button" className="intro-skip" onClick={close}>略過動畫</button>
    </div>
  );
}
