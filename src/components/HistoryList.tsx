"use client";

import { Loader2 } from "lucide-react";
import type { HistoryEntry } from "@/types";

interface HistoryListProps {
  history: HistoryEntry[];
  onSelect: (entry: HistoryEntry) => void;
  isLoading?: boolean;
}

/**
 * 履歴リスト（モーダル本体とは分離）
 * Supabase の conversion_history テーブルのデータを表示する
 */
export function HistoryList({ history, onSelect, isLoading }: HistoryListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-zinc-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span className="text-sm">読み込み中...</span>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-zinc-500">まだ変換履歴がありません。</p>
        <p className="text-xs text-zinc-400 mt-1">問題を変換すると、ここに記録されます。</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {history.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className="w-full rounded-xl bg-zinc-50 p-3 text-left ring-1 ring-inset ring-black/5 hover:bg-zinc-100 active:scale-[0.98] transition-all"
            onClick={() => onSelect(item)}
          >
            {/* 日時 */}
            <p className="text-xs font-semibold text-zinc-500">{item.createdAt}</p>
            {/* サマリー */}
            <p className="mt-1 text-sm font-medium text-zinc-900">{item.summary}</p>
            {/* 変換数バッジ */}
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                🔢 {item.numbersDetected}個の数字を変換
              </span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
