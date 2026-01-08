'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ChevronRight, Sparkles, X, ImageIcon } from 'lucide-react';
import type { GenerateResult } from '@/types';
import { useAppShell } from '@/components/AppShell';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ProblemCard } from '@/components/ProblemCard';
import { compressImage } from '@/lib/imageCompression';
import { formatNow, generateId } from '@/lib/utils';
import { RATE_LIMIT_WAIT_SECONDS } from '@/lib/gemini';
import { AdBanner } from '@/components/ads/AdBanner';

const PdfDownloadButton = dynamic(
  () => import('@/components/PdfDownloadButton').then((m) => m.PdfDownloadButton),
  { ssr: false }
);

const CanvasImageEditor = dynamic(
  () => import('@/components/CanvasImageEditor').then((m) => m.CanvasImageEditor),
  { ssr: false }
);

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);

  // Core State
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [createdAt, setCreatedAt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('生成中…');
  const [error, setError] = useState<string | null>(null);
  const [waitSeconds, setWaitSeconds] = useState(0);

  const isWaiting = waitSeconds > 0;

  // AppShell context
  const shell = useAppShell();
  const { addHistoryEntry, selectedHistoryEntry, clearSelectedHistoryEntry, incrementApiUsage, apiUsage } = shell ?? {};
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

  // カウントダウンタイマー
  useEffect(() => {
    if (waitSeconds <= 0) return;
    const timer = setTimeout(() => setWaitSeconds((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [waitSeconds]);

  // 履歴選択時の処理
  useEffect(() => {
    if (!selectedHistoryEntry || !clearSelectedHistoryEntry) return;
    setResult(selectedHistoryEntry.result);
    setCreatedAt(selectedHistoryEntry.createdAt);
    setError(null);
    clearSelectedHistoryEntry();
  }, [selectedHistoryEntry, clearSelectedHistoryEntry]);

  // ファイル選択
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    setResult(null);
    setError(null);
  }, []);

  // ファイルをクリア
  const clearFile = useCallback(() => {
    setImageFile(null);
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  // 生成処理
  const generate = useCallback(async () => {
    if (!imageFile) {
      setError('先に問題画像を選択してください。');
      return;
    }

    setError(null);
    setResult(null);
    setCreatedAt('');
    setIsLoading(true);

    try {
      setLoadingMessage('画像を最適化中...');
      const optimizedFile = await compressImage(imageFile);

      const formData = new FormData();
      formData.append('image', optimizedFile, optimizedFile.name);

      setLoadingMessage('AIが類題を生成中...');
      const res = await fetch('/api/generate', { method: 'POST', body: formData });
      const data = await res.json() as { error?: string } | GenerateResult;

      if (res.status === 429) {
        setWaitSeconds(RATE_LIMIT_WAIT_SECONDS);
        throw new Error('error' in data ? data.error : '利用制限に達しました。1分ほど間隔を空けてください。');
      }

      if (!res.ok) {
        throw new Error('error' in data ? data.error : `Request failed (${res.status})`);
      }

      const generated = data as GenerateResult;
      const ts = formatNow();
      setResult(generated);
      setCreatedAt(ts);

      incrementApiUsage?.();
      addHistoryEntry?.({ id: generateId(), createdAt: ts, result: generated });
    } catch (e) {
      setError(e instanceof Error ? e.message : '不明なエラー');
    } finally {
      setIsLoading(false);
    }
  }, [imageFile, incrementApiUsage, addHistoryEntry]);

  // 使用量のステータス色
  const usageStatusColor = useMemo(() =>
    apiUsageCount < apiUsageLimit * 0.8 ? 'bg-[#34C759]' : 'bg-[#FF9500]'
  , [apiUsageCount, apiUsageLimit]);

  return (
    <>
      {isLoading && <LoadingOverlay message={loadingMessage} />}

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
                  <p className="text-base font-semibold text-slate-800">問題用紙を撮影</p>
                  <p className="text-sm text-slate-500 mt-1">タップしてカメラまたはアルバムから選択</p>
                </div>
              </button>
            )}
          </div>

          {/* 生成ボタン - 画像がある時のみ表示 */}
          {imageFile && (
            <div className="p-4 pt-0">
              <button
                type="button"
                onClick={generate}
                disabled={isLoading || isWaiting}
                className={`
                  relative w-full h-14 rounded-full text-base font-semibold overflow-hidden
                  flex items-center justify-center gap-2 transition-all duration-200
                  active:scale-[0.96] disabled:active:scale-100
                  ${isWaiting
                    ? 'bg-slate-100 text-slate-400 border border-slate-200'
                    : 'bg-[#007AFF] text-white hover:bg-[#0066DD] shadow-[0_4px_14px_rgb(0,122,255,0.25)] disabled:opacity-50'
                  }
                `}
              >
                {/* スキャンアニメーション */}
                {!isWaiting && !isLoading && (
                  <div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                    style={{ animation: 'scanning 2s ease-in-out infinite' }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  {isWaiting ? (
                    <>⏳ 再試行まであと {waitSeconds} 秒</>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      類題を生成
                    </>
                  )}
                </span>
              </button>

              {/* カウントダウン */}
              {isWaiting && (
                <div className="mt-3">
                  <ProgressBar current={waitSeconds} total={RATE_LIMIT_WAIT_SECONDS} message="AIが休憩中です。あと少しお待ちください。" />
                </div>
              )}
            </div>
          )}

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

        {/* 結果セクション */}
        {result && (
          <section className="rounded-[32px] bg-white/70 backdrop-blur-2xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden animate-fadeIn">
            <div className="px-6 pt-6 pb-4">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-[#FF9500]/10 flex items-center justify-center">📝</span>
                生成結果
              </h2>
            </div>
            <div className="mx-4 mb-4 rounded-2xl bg-white/60 border border-white/40 divide-y divide-slate-200/50 overflow-hidden">
              {result.map((problem, idx) => (
                <div
                  key={problem.id}
                  className="flex items-center justify-between px-4 py-3.5 hover:bg-slate-50/50 transition-colors cursor-pointer group"
                  style={{ animationDelay: `${idx * 80}ms`, animation: 'fadeSlideIn 0.4s ease-out forwards', opacity: 0 }}
                >
                  <div className="flex-1 min-w-0">
                    <ProblemCard problem={problem} index={idx} isLast={idx === result.length - 1} />
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-400 transition-colors flex-shrink-0 ml-2" />
                </div>
              ))}
            </div>
            <div className="px-6 pb-6">
              <PdfDownloadButton result={result} createdAt={createdAt} />
            </div>
          </section>
        )}
      </main>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out forwards;
        }
        @keyframes scanning {
          0%, 100% { transform: translateX(-100%); }
          50% { transform: translateX(100%); }
        }
      `}</style>
    </>
  );
}
