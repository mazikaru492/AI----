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
      <div className="mx-auto flex h-12 md:h-14 w-full max-w-md md:max-w-4xl items-center justify-between px-4 md:px-6">
        {/* ロゴ: PC→大きめ、スマホ→コンパクト */}
        <div className="text-sm md:text-base font-semibold text-white drop-shadow-sm">
          AI問題変換
        </div>

        {/* ボタン群 */}
        <div className="flex items-center gap-1.5 md:gap-2">
          <button
            type="button"
            onClick={onHistoryClick}
            className="liquid-button inline-flex h-9 md:h-10 items-center gap-1.5 md:gap-2 rounded-xl px-2.5 md:px-3 text-xs md:text-sm font-semibold"
          >
            <Clock className="h-3.5 w-3.5 md:h-4 md:w-4" aria-hidden="true" />
            履歴
          </button>
          <button
            type="button"
            onClick={onCreatorClick}
            className="liquid-button inline-flex h-9 md:h-10 items-center gap-1.5 md:gap-2 rounded-xl px-2.5 md:px-3 text-xs md:text-sm font-semibold"
          >
            <User className="h-3.5 w-3.5 md:h-4 md:w-4" aria-hidden="true" />
            制作者
          </button>
        </div>
      </div>
    </nav>
  );
}
