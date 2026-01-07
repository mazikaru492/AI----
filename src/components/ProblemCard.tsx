'use client';

import type { ProblemItem } from '@/types';

interface ProblemCardProps {
  problem: ProblemItem;
  index: number;
  isLast: boolean;
}

/**
 * 問題カード（類題・解答表示）
 */
export function ProblemCard({ problem, index, isLast }: ProblemCardProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">
          {index + 1}
        </div>
        <p className="text-xs font-semibold text-zinc-700">問題 {index + 1}</p>
      </div>

      <div className="rounded-xl bg-zinc-50 p-3">
        <p className="text-xs font-semibold text-zinc-700">類題</p>
        <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-900">
          {problem.question}
        </p>
      </div>

      <div className="rounded-xl bg-zinc-50 p-3">
        <p className="text-xs font-semibold text-zinc-700">解答</p>
        <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-900">
          {problem.answer}
        </p>
      </div>

      {!isLast && <div className="border-t border-zinc-200" />}
    </div>
  );
}
