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
 */
export function ProgressBar({ current, total, message }: ProgressBarProps) {
  const percentage = Math.max(0, Math.min(100, (current / total) * 100));

  return (
    <div className="-mt-1">
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-zinc-200"
        aria-label="retry countdown"
      >
        <div
          className="h-full bg-blue-500 transition-all duration-1000 ease-linear"
          style={{ width: `${percentage}%` }}
        />
      </div>
      {message && <p className="mt-2 text-xs text-zinc-600">{message}</p>}
    </div>
  );
}
