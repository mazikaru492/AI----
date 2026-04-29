'use client';

import type { ProblemItem } from '@/types';

interface ProblemCardProps {
  problem: ProblemItem;
  index: number;
  isLast: boolean;
}

/**
 * 問題カード — iOS 26 Liquid Glass
 */
export function ProblemCard({ problem, index, isLast }: ProblemCardProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/30 text-xs font-semibold text-white backdrop-blur-sm">
          {index + 1}
        </div>
        <p className="text-xs font-semibold text-white/70">問題 {index + 1}</p>
      </div>

      <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)" }}>
        <p className="text-xs font-semibold text-white/55">類題</p>
        <p className="mt-2 whitespace-pre-wrap text-sm text-white">{problem.question}</p>
      </div>

      <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)" }}>
        <p className="text-xs font-semibold text-white/55">解答</p>
        <p className="mt-2 whitespace-pre-wrap text-sm text-white">{problem.answer}</p>
      </div>

      {!isLast && <div style={{ borderTop: "1px solid rgba(255,255,255,0.15)" }} />}
    </div>
  );
}
