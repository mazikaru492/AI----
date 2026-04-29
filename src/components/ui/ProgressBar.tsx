'use client';

interface ProgressBarProps {
  current: number;
  total: number;
  message?: string;
}

/**
 * プログレスバー — iOS 26 Liquid Glass
 */
export function ProgressBar({ current, total, message }: ProgressBarProps) {
  const percentage = Math.max(0, Math.min(100, (current / total) * 100));

  return (
    <div className="-mt-1">
      <div
        className="h-2 w-full overflow-hidden rounded-full"
        aria-label="retry countdown"
        style={{ background: "rgba(255,255,255,0.2)" }}
      >
        <div
          className="h-full transition-all duration-1000 ease-linear rounded-full"
          style={{
            width: `${percentage}%`,
            background: "linear-gradient(90deg, rgba(255,255,255,0.7), rgba(255,255,255,0.9))",
          }}
        />
      </div>
      {message && <p className="mt-2 text-xs text-white/55">{message}</p>}
    </div>
  );
}
