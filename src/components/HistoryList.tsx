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
 * Liquid Glass ダークテーマ対応
 */
export function HistoryList({ history, onSelect, isLoading }: HistoryListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8" style={{ color: 'var(--text-tertiary)' }}>
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span className="text-sm">読み込み中...</span>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>まだ変換履歴がありません。</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>問題を変換すると、ここに記録されます。</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {history.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className="w-full rounded-xl p-3 text-left transition-all active:scale-[0.98]"
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '0.5px solid rgba(255, 255, 255, 0.08)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
            }}
            onClick={() => onSelect(item)}
          >
            {/* 日時 */}
            <p className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>{item.createdAt}</p>
            {/* サマリー */}
            <p className="mt-1 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.summary}</p>
            {/* 変換数バッジ */}
            <div className="mt-1.5 flex items-center gap-1.5">
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                style={{
                  background: 'var(--primary-soft)',
                  color: '#60a5fa',
                }}
              >
                🔢 {item.numbersDetected}個の数字を変換
              </span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
