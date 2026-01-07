"use client";

import type { HistoryEntry } from "@/types";

interface HistoryListProps {
  history: HistoryEntry[];
  onSelect: (entry: HistoryEntry) => void;
}

function safeGetProblemText(result: unknown): string {
  if (Array.isArray(result) && result.length > 0) {
    const first = result[0] as { question?: unknown } | undefined;
    const text = first?.question;
    if (typeof text === "string" && text.trim()) {
      return result.length > 1 ? `${text} 他${result.length - 1}問` : text;
    }
  }
  const r = result as { new_problem?: { problem_text?: unknown } } | undefined;
  const text = r?.new_problem?.problem_text;
  return typeof text === "string" && text.trim() ? text : "(問題文なし)";
}

/**
 * 履歴リスト（モーダル本体とは分離）
 */
export function HistoryList({ history, onSelect }: HistoryListProps) {
  if (history.length === 0) {
    return <p className="text-sm text-zinc-600">まだ履歴がありません。</p>;
  }

  return (
    <ul className="space-y-2">
      {history.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className="w-full rounded-xl bg-zinc-50 p-3 text-left ring-1 ring-inset ring-black/5 hover:bg-zinc-100"
            onClick={() => onSelect(item)}
          >
            <p className="text-xs font-semibold text-zinc-700">
              {item.createdAt}
            </p>
            <p className="mt-1 line-clamp-2 text-sm text-zinc-900">
              {safeGetProblemText(item.result)}
            </p>
          </button>
        </li>
      ))}
    </ul>
  );
}
