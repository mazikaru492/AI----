'use client';

import type { ProblemItem } from '@/types';

interface ProblemCardProps {
  problem: ProblemItem;
  index: number;
  isLast: boolean;
}

/**
 * 問題カード（類題・解答表示）
 * Liquid Glass ダークテーマ対応
 */
export function ProblemCard({ problem, index, isLast }: ProblemCardProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div
          className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold"
          style={{
            background: 'rgba(59, 130, 246, 0.2)',
            color: '#60a5fa',
          }}
        >
          {index + 1}
        </div>
        <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
          問題 {index + 1}
        </p>
      </div>

      <div
        className="rounded-xl p-3"
        style={{
          background: 'rgba(255, 255, 255, 0.04)',
          border: '0.5px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <p className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>類題</p>
        <p className="mt-2 whitespace-pre-wrap text-sm" style={{ color: 'var(--text-primary)' }}>
          {problem.question}
        </p>
      </div>

      <div
        className="rounded-xl p-3"
        style={{
          background: 'rgba(255, 255, 255, 0.04)',
          border: '0.5px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <p className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>解答</p>
        <p className="mt-2 whitespace-pre-wrap text-sm" style={{ color: 'var(--text-primary)' }}>
          {problem.answer}
        </p>
      </div>

      {!isLast && (
        <div style={{ borderTop: '0.5px solid rgba(255, 255, 255, 0.06)' }} />
      )}
    </div>
  );
}
