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
  safe: { bg: 'rgba(52,199,89,0.25)', text: '#fff', dot: '#34c759', bar: 'linear-gradient(90deg,#34c759,#4ade80)' },
  warning: { bg: 'rgba(255,149,0,0.25)', text: '#fff', dot: '#ff9500', bar: 'linear-gradient(90deg,#ff9500,#fbbf24)' },
  critical: { bg: 'rgba(255,59,48,0.25)', text: '#fff', dot: '#ff3b30', bar: 'linear-gradient(90deg,#ff3b30,#f87171)' },
};

/**
 * API使用状況バッジ — iOS 26 Liquid Glass
 */
export function UsageStatsBadge({ count, limit, hydrated, modelName }: UsageStatsBadgeProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!hydrated || !mounted) {
    return <div className="h-8 w-20 rounded-full liquid-skeleton" />;
  }

  const level = getUsageLevel(count, limit);
  const colors = levelColors[level];
  const percentage = Math.min(100, (count / limit) * 100);
  const modelLabel = getModelLabel(modelName);

  return (
    <div
      className="relative flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors duration-200"
      style={{
        background: colors.bg,
        border: '1px solid rgba(255,255,255,0.3)',
        backdropFilter: 'blur(12px)',
      }}
      title={`本日の使用回数: ${count}回`}
    >
      <span
        className={`h-2 w-2 rounded-full ${level === 'warning' ? 'animate-pulse' : ''}`}
        style={{ background: colors.dot }}
        aria-hidden="true"
      />
      <div className="flex items-baseline gap-0.5">
        <span className="font-mono text-sm font-semibold tabular-nums text-white">
          {count.toLocaleString()}
        </span>
        <span className="text-[10px] text-white/55">/ {limit.toLocaleString()}</span>
      </div>
      {modelLabel && (
        <span className="ml-0.5 rounded bg-white/15 px-1 py-0.5 text-[9px] font-medium uppercase text-white/65">
          {modelLabel}
        </span>
      )}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden rounded-b-full" style={{ background: 'rgba(255,255,255,0.1)' }}>
        <div className="h-full transition-all duration-300" style={{ width: `${percentage}%`, background: colors.bar }} />
      </div>
    </div>
  );
}
