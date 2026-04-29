'use client';

import { useEffect, useState } from 'react';

export interface UsageStatsBadgeProps {
  count: number;
  limit: number;
  hydrated: boolean;
  modelName?: string;
}

type UsageLevel = 'safe' | 'warning' | 'critical';

function getUsageLevel(count: number, limit: number): UsageLevel {
  const percentage = count / limit;
  if (percentage >= 1) return 'critical';
  if (percentage >= 0.8) return 'warning';
  return 'safe';
}

function getModelLabel(modelName?: string): string | null {
  if (!modelName) return null;
  if (modelName.toLowerCase().includes('gemma')) return 'Gemma';
  if (modelName.toLowerCase().includes('2.5')) return '2.5';
  if (modelName.toLowerCase().includes('2.0')) return '2.0';
  return null;
}

/** Liquid Glass ダークテーマに合わせた使用レベルカラー */
const levelColors = {
  safe: {
    bg: 'rgba(34, 197, 94, 0.12)',
    text: '#4ade80',
    bar: 'linear-gradient(90deg, #22c55e, #4ade80)',
    dot: '#22c55e',
  },
  warning: {
    bg: 'rgba(245, 158, 11, 0.12)',
    text: '#fbbf24',
    bar: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
    dot: '#f59e0b',
  },
  critical: {
    bg: 'rgba(239, 68, 68, 0.12)',
    text: '#f87171',
    bar: 'linear-gradient(90deg, #ef4444, #f87171)',
    dot: '#ef4444',
  },
};

/**
 * API使用状況バッジ
 * Liquid Glass ダークテーマ対応のPill型デザイン
 */
export function UsageStatsBadge({
  count,
  limit,
  hydrated,
  modelName,
}: UsageStatsBadgeProps) {
  const [mounted, setMounted] = useState(false);

  // Hydration safety: only render after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Don't render until hydrated and mounted
  if (!hydrated || !mounted) {
    return (
      <div className="h-8 w-20 rounded-full liquid-skeleton" />
    );
  }

  const level = getUsageLevel(count, limit);
  const colors = levelColors[level];
  const percentage = Math.min(100, (count / limit) * 100);
  const modelLabel = getModelLabel(modelName);

  const tooltipText =
    level === 'critical'
      ? '本日の利用上限に達しました'
      : level === 'warning'
        ? '本日の利用回数が残りわずかです'
        : `本日の使用回数: ${count}回`;

  return (
    <div
      className="relative flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors duration-200"
      style={{
        background: colors.bg,
        border: '0.5px solid rgba(255, 255, 255, 0.08)',
      }}
      title={tooltipText}
    >
      {/* Status dot */}
      <span
        className={`h-2 w-2 rounded-full ${level === 'warning' ? 'animate-pulse' : ''}`}
        style={{ background: colors.dot }}
        aria-hidden="true"
      />

      {/* Count display */}
      <div className="flex items-baseline gap-0.5">
        <span
          className="font-mono text-sm font-semibold tabular-nums"
          style={{ color: colors.text }}
        >
          {count.toLocaleString()}
        </span>
        <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
          / {limit.toLocaleString()}
        </span>
      </div>

      {/* Model label badge */}
      {modelLabel && (
        <span
          className="ml-0.5 rounded px-1 py-0.5 text-[9px] font-medium uppercase"
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            color: 'var(--text-tertiary)',
          }}
        >
          {modelLabel}
        </span>
      )}

      {/* Progress bar at bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden rounded-b-full"
        style={{ background: 'rgba(255, 255, 255, 0.04)' }}
      >
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${percentage}%`,
            background: colors.bar,
          }}
        />
      </div>
    </div>
  );
}
