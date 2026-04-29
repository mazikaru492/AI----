'use client';

interface LoadingOverlayProps {
  message?: string;
}

/**
 * ローディングオーバーレイ — iOS 26 Liquid Glass
 */
export function LoadingOverlay({ message = '生成中…' }: LoadingOverlayProps) {
  return (
    <div className="liquid-overlay fixed inset-0 z-50 flex items-center justify-center">
      <div className="liquid-panel animate-modalSlideUp w-[92%] max-w-sm rounded-[28px] p-6 text-center">
        <div
          className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full"
          aria-label="loading"
          style={{ border: "3px solid rgba(255,255,255,0.25)", borderTopColor: "#fff" }}
        />
        <p className="text-sm font-medium text-white">{message}</p>
        <p className="mt-1 text-xs text-white/55">操作をロックしています</p>
      </div>
    </div>
  );
}
