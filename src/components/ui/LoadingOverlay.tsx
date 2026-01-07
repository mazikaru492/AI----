'use client';

interface LoadingOverlayProps {
  message?: string;
}

/**
 * ローディングオーバーレイ
 * 処理中にUIをロックして進捗を表示
 */
export function LoadingOverlay({ message = '生成中…' }: LoadingOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[92%] max-w-sm rounded-2xl bg-white p-6 text-center">
        <div
          className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-900"
          aria-label="loading"
        />
        <p className="text-sm font-medium text-zinc-900">{message}</p>
        <p className="mt-1 text-xs text-zinc-600">操作をロックしています</p>
      </div>
    </div>
  );
}
