'use client';

import { useState, useEffect } from 'react';

interface AdBannerProps {
  /**
   * 広告スロットの識別子
   */
  slot?: string;
  /**
   * 広告の配置位置
   */
  position?: 'top' | 'middle' | 'bottom';
  /**
   * 広告を表示するかどうか
   */
  enabled?: boolean;
  /**
   * カスタムクラス名
   */
  className?: string;
}

/**
 * 広告バナーコンポーネント
 *
 * 将来のアフィリエイト広告配置用のプレースホルダー
 * 現在は開発モードでのみプレースホルダーを表示
 */
export function AdBanner({
  slot = 'default',
  position = 'middle',
  enabled = false,
  className = '',
}: AdBannerProps) {
  const [isDevMode, setIsDevMode] = useState(false);

  useEffect(() => {
    // 開発環境かどうかを判定
    setIsDevMode(process.env.NODE_ENV === 'development');
  }, []);

  // 広告が無効の場合は何も表示しない
  if (!enabled) {
    return null;
  }

  // 開発モードではプレースホルダーを表示
  if (isDevMode) {
    return (
      <div
        className={`
          rounded-2xl border-2 border-dashed border-slate-300
          bg-slate-50/50 backdrop-blur-sm
          p-4 text-center
          ${className}
        `}
        data-ad-slot={slot}
        data-ad-position={position}
      >
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200">
            <span className="text-lg">📢</span>
          </div>
          <p className="text-sm font-medium text-slate-500">
            Ad Placeholder
          </p>
          <p className="text-xs text-slate-400">
            Slot: {slot} | Position: {position}
          </p>
        </div>
      </div>
    );
  }

  // 本番環境での広告レンダリング（将来実装）
  return (
    <div
      className={`ad-container ${className}`}
      data-ad-slot={slot}
      data-ad-position={position}
    >
      {/*
        将来的にここに実際の広告スクリプトを挿入
        例: Google AdSense, Amazon Associates, etc.
      */}
    </div>
  );
}

/**
 * 広告コンテナのラッパーコンポーネント
 * グラスモーフィズムスタイルで広告を表示
 */
export function AdContainer({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`
        rounded-[32px] bg-white/70 backdrop-blur-2xl
        border border-white/40 shadow-xl shadow-black/5
        p-4 animate-in fade-in slide-in-from-bottom-4 duration-500
        ${className}
      `}
    >
      {children}
    </section>
  );
}
