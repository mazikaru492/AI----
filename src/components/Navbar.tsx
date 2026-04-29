"use client";

import { Clock, User } from "lucide-react";

interface NavbarProps {
  onHistoryClick: () => void;
  onCreatorClick: () => void;
}

/**
 * ナビゲーションバー
 * Liquid Glass スタイルの半透明ナビゲーション
 */
export function Navbar({ onHistoryClick, onCreatorClick }: NavbarProps) {
  return (
    <nav className="sticky top-0 z-40 w-full liquid-panel-soft" style={{
      borderBottom: '0.5px solid rgba(255, 255, 255, 0.08)',
      borderRadius: 0,
    }}>
      <div className="mx-auto flex h-14 w-full max-w-md items-center justify-between px-4">
        <div className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
          AI問題変換
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onHistoryClick}
            className="liquid-button inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold"
          >
            <Clock className="h-4 w-4" aria-hidden="true" />
            履歴
          </button>
          <button
            type="button"
            onClick={onCreatorClick}
            className="liquid-button inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold"
          >
            <User className="h-4 w-4" aria-hidden="true" />
            制作者
          </button>
        </div>
      </div>
    </nav>
  );
}
