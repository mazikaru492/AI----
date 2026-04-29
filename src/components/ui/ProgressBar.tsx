'use client';

interface ProgressBarProps {
  /** 現在の値 */
  current: number;
  /** 最大値 */
  total: number;
  /** 追加のメッセージ */
  message?: string;
}

/**
 * プログレスバー（カウントダウン表示用）
 * Liquid Glass ダークテーマ対応
 */
export function ProgressBar({ current, total, message }: ProgressBarProps) {
  const percentage = Math.max(0, Math.min(100, (current / total) * 100));

  return (
    <div className="-mt-1">
      <div
        className="h-2 w-full overflow-hidden rounded-full"
        aria-label="retry countdown"
        style={{ background: 'rgba(255, 255, 255, 0.06)' }}
      >
        <div
          className="h-full transition-all duration-1000 ease-linear"
          style={{
            width: `${percentage}%`,
            background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
          }}
        />
      </div>
      {message && (
        <p className="mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {message}
        </p>
      )}
    </div>
  );
}
