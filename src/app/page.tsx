'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, X, ImageIcon } from 'lucide-react';
import { useAppShell } from '@/components/AppShell';
import { AdBanner } from '@/components/ads/AdBanner';

const CanvasImageEditor = dynamic(
  () => import('@/components/CanvasImageEditor').then((m) => m.CanvasImageEditor),
  { ssr: false }
);

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);

  // Core State
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AppShell context
  const shell = useAppShell();
  const { incrementApiUsage, apiUsage } = shell ?? {};
  const apiUsageCount = apiUsage?.count ?? 0;
  const apiUsageLimit = apiUsage?.limit ?? 1500;

  // プレビューURL生成
  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  // ファイル選択
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    setError(null);
  }, []);

  // ファイルをクリア
  const clearFile = useCallback(() => {
    setImageFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  // 使用量のステータス色
  const usageStatusColor = useMemo(() =>
    apiUsageCount < apiUsageLimit * 0.8 ? 'bg-[#34C759]' : 'bg-[#FF9500]'
  , [apiUsageCount, apiUsageLimit]);

  return (
    <>
      {/* 背景 */}
      <div className="fixed inset-0 bg-[#F2F2F7] -z-10">
        <div
          className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-40"
          style={{ background: 'radial-gradient(circle, rgba(0,122,255,0.15) 0%, transparent 70%)', filter: 'blur(60px)' }}
        />
        <div
          className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full opacity-30"
          style={{ background: 'radial-gradient(circle, rgba(52,199,89,0.15) 0%, transparent 70%)', filter: 'blur(60px)' }}
        />
      </div>

      {/* ナビゲーションバー */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-[#F2F2F7]/85 border-b border-white/20">
        <div className="mx-auto max-w-lg px-5 h-14 flex items-center justify-between">
          <h1 className="text-lg font-bold tracking-tight text-slate-900">AI問題変換</h1>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/50 backdrop-blur-sm border border-white/30 shadow-sm">
            <span className={`w-2 h-2 rounded-full ${usageStatusColor}`} />
            <span className="font-mono text-sm font-medium text-slate-700">{apiUsageCount}/{apiUsageLimit}</span>
          </div>
        </div>
      </nav>

      <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-5 py-6">
        {/* タイトル */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">AI問題変換</h2>
          <p className="text-sm text-slate-600">問題用紙を撮影すると、数値だけ変えた類題を作成します</p>
        </div>

        {/* 隠しファイル入力 - capture属性なしでアルバム選択可能 */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* メインカード - アップロード/プレビュー */}
        <section className="rounded-[32px] bg-white/70 backdrop-blur-2xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          {/* プレビューエリア */}
          <div className="relative">
            {previewUrl ? (
              // State B: 画像プレビュー
              <div className="relative aspect-[4/3] bg-slate-100">
                <img
                  src={previewUrl}
                  alt="プレビュー"
                  className="w-full h-full object-contain"
                />
                {/* 削除ボタン */}
                <button
                  type="button"
                  onClick={clearFile}
                  disabled={isLoading}
                  className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/70 transition-colors active:scale-95 disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
                {/* 変更ボタン */}
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={isLoading}
                  className="absolute bottom-3 right-3 px-4 py-2 rounded-full bg-white/80 backdrop-blur-md flex items-center gap-2 text-sm font-medium text-slate-700 hover:bg-white transition-colors active:scale-95 disabled:opacity-50 shadow-lg"
                >
                  <ImageIcon className="w-4 h-4" />
                  変更
                </button>
              </div>
            ) : (
              // State A: アップロード促進
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={isLoading}
                className="w-full aspect-[4/3] flex flex-col items-center justify-center gap-4 group transition-all duration-300 hover:bg-slate-50/50 active:scale-[0.98] disabled:opacity-50"
              >
                <div className="w-20 h-20 rounded-full bg-[#007AFF]/10 flex items-center justify-center group-hover:bg-[#007AFF]/15 transition-colors">
                  <Camera className="w-10 h-10 text-[#007AFF] stroke-[1.5]" />
                </div>
                <div className="text-center">
                  <p className="text-base font-semibold text-slate-800">カメラで撮影（または画像を選択）</p>
                  <p className="text-sm text-slate-500 mt-1">タップしてカメラまたはアルバムから選択</p>
                </div>
              </button>
            )}
          </div>

          {/* エラー */}
          {error && (
            <div className="mx-4 mb-4 rounded-2xl bg-[#FF3B30]/10 border border-[#FF3B30]/20 p-4">
              <p className="text-sm font-medium text-[#FF3B30]">{error}</p>
            </div>
          )}
        </section>

        <AdBanner slot="main-page-middle" position="middle" enabled={false} />

        {/* 画像編集セクション */}
        {imageFile && (
          <section className="rounded-[32px] bg-white/70 backdrop-blur-2xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 animate-fadeIn">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-4">
              <span className="w-8 h-8 rounded-xl bg-[#5856D6]/10 flex items-center justify-center">🖼️</span>
              画像編集
            </h2>
            <CanvasImageEditor imageFile={imageFile} onComplete={() => incrementApiUsage?.()} />
          </section>
        )}

        {/* 選択中のファイル名表示 */}
        {imageFile && (
          <div className="flex items-center justify-center gap-2 text-sm text-slate-600">
            <span className="w-2 h-2 rounded-full bg-[#34C759]" />
            <span>選択中: {imageFile.name}</span>
          </div>
        )}
      </main>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out forwards;
        }
      `}</style>
    </>
  );
}
