'use client';

import { Clock, User } from 'lucide-react';

interface NavbarProps {
  onHistoryClick: () => void;
  onCreatorClick: () => void;
}

/**
 * ナビゲーションバー
 */
export function Navbar({ onHistoryClick, onCreatorClick }: NavbarProps) {
  return (
    <nav className="sticky top-0 z-40 w-full bg-white/80 backdrop-blur ring-1 ring-black/5">
      <div className="mx-auto flex h-14 w-full max-w-md items-center justify-between px-4">
        <div className="text-base font-semibold text-zinc-900">AI問題変換</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onHistoryClick}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-3 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50"
          >
            <Clock className="h-4 w-4" aria-hidden="true" />
            履歴
          </button>
          <button
            type="button"
            onClick={onCreatorClick}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-3 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50"
          >
            <User className="h-4 w-4" aria-hidden="true" />
            制作者
          </button>
        </div>
      </div>
    </nav>
  );
}
