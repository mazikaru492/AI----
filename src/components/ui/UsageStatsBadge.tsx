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

const levelColors = {
  safe: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    bar: 'bg-emerald-500',
    dot: 'bg-emerald-500',
  },
  warning: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    bar: 'bg-amber-500',
    dot: 'bg-amber-500',
  },
  critical: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    bar: 'bg-red-500',
    dot: 'bg-red-500',
  },
};

/**
 * API使用状況バッジ
 * プロフェッショナルなPill型デザインでAPI使用回数を表示
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
      <div className="h-8 w-20 animate-pulse rounded-full bg-slate-100" />
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
      className={`relative flex items-center gap-1.5 rounded-full px-3 py-1.5 ${colors.bg} transition-colors duration-200`}
      title={tooltipText}
    >
      {/* Status dot */}
      <span
        className={`h-2 w-2 rounded-full ${colors.dot} ${level === 'warning' ? 'animate-pulse' : ''}`}
        aria-hidden="true"
      />

      {/* Count display */}
      <div className="flex items-baseline gap-0.5">
        <span className={`font-mono text-sm font-semibold tabular-nums ${colors.text}`}>
          {count.toLocaleString()}
        </span>
        <span className="text-[10px] text-slate-500">
          / {limit.toLocaleString()}
        </span>
      </div>

      {/* Model label badge */}
      {modelLabel && (
        <span className="ml-0.5 rounded bg-slate-200 px-1 py-0.5 text-[9px] font-medium uppercase text-slate-600">
          {modelLabel}
        </span>
      )}

      {/* Progress bar at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden rounded-b-full bg-slate-200/50">
        <div
          className={`h-full transition-all duration-300 ${colors.bar}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
