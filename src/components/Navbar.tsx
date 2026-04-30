"use client";

import { Clock, User } from "lucide-react";

interface NavbarProps {
  onHistoryClick: () => void;
  onCreatorClick: () => void;
}

/**
 * ナビゲーションバー — iOS 26 Liquid Glass
 * PC: 横幅フル活用、大きめのボタン
 * スマホ: コンパクト、タッチフレンドリー
 */
export function Navbar({ onHistoryClick, onCreatorClick }: NavbarProps) {
  return (
    <nav
      className="sticky top-0 z-40 w-full liquid-panel-soft"
      style={{
        borderRadius: 0,
        borderLeft: "none",
        borderRight: "none",
        borderTop: "none",
      }}
    >
      {/* PC: max-w-4xl / スマホ: max-w-md でコンテンツ幅を切り替え */}
      <div className="mx-auto flex h-14 md:h-18 w-full max-w-md md:max-w-6xl items-center justify-between px-4 md:px-8">
        {/* ロゴ */}
        <div className="text-base md:text-xl font-semibold text-white drop-shadow-sm">
          AI問題変換
        </div>

        {/* ボタン群 */}
        <div className="flex items-center gap-2 md:gap-3">
          <button
            type="button"
            onClick={onHistoryClick}
            className="liquid-button inline-flex h-10 md:h-12 items-center gap-2 md:gap-2.5 rounded-xl px-3 md:px-5 text-sm md:text-base font-semibold"
          >
            <Clock className="h-4 w-4 md:h-5 md:w-5" aria-hidden="true" />
            履歴
          </button>
          <button
            type="button"
            onClick={onCreatorClick}
            className="liquid-button inline-flex h-10 md:h-12 items-center gap-2 md:gap-2.5 rounded-xl px-3 md:px-5 text-sm md:text-base font-semibold"
          >
            <User className="h-4 w-4 md:h-5 md:w-5" aria-hidden="true" />
            制作者
          </button>
        </div>
      </div>
    </nav>
  );
}
