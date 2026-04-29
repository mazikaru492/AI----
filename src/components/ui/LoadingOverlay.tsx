'use client';

interface LoadingOverlayProps {
  message?: string;
}

/**
 * ローディングオーバーレイ
 * 処理中にUIをロックして進捗を表示
 * Liquid Glass ダークテーマ対応
 */
export function LoadingOverlay({ message = '生成中…' }: LoadingOverlayProps) {
  return (
    <div className="liquid-overlay fixed inset-0 z-50 flex items-center justify-center">
      <div className="liquid-panel animate-modalSlideUp w-[92%] max-w-sm rounded-2xl p-6 text-center">
        <div
          className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full"
          aria-label="loading"
          style={{
            border: '3px solid rgba(255, 255, 255, 0.1)',
            borderTopColor: '#60a5fa',
          }}
        />
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {message}
        </p>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          操作をロックしています
        </p>
      </div>
    </div>
  );
}
