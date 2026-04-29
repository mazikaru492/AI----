"use client";

import { Loader2 } from "lucide-react";
import type { HistoryEntry } from "@/types";

interface HistoryListProps {
  history: HistoryEntry[];
  onSelect: (entry: HistoryEntry) => void;
  isLoading?: boolean;
}

/**
 * 履歴リスト — iOS 26 Liquid Glass
 */
export function HistoryList({ history, onSelect, isLoading }: HistoryListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-white/60">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span className="text-sm">読み込み中...</span>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-white/70">まだ変換履歴がありません。</p>
        <p className="text-xs text-white/50 mt-1">問題を変換すると、ここに記録されます。</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {history.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className="w-full rounded-2xl p-3 text-left transition-all active:scale-[0.98]"
            style={{
              background: "rgba(255, 255, 255, 0.15)",
              border: "1px solid rgba(255, 255, 255, 0.25)",
              backdropFilter: "blur(12px)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.25)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.15)";
            }}
            onClick={() => onSelect(item)}
          >
            <p className="text-xs font-semibold text-white/55">{item.createdAt}</p>
            <p className="mt-1 text-sm font-medium text-white">{item.summary}</p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium text-white/90">
                🔢 {item.numbersDetected}個の数字を変換
              </span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
