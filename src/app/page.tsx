'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, ChevronRight, Sparkles } from 'lucide-react';
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
  () =>
    import('@/components/PdfDownloadButton').then((m) => m.PdfDownloadButton),
  { ssr: false }
);

const CanvasImageEditor = dynamic(
  () =>
    import('@/components/CanvasImageEditor').then((m) => m.CanvasImageEditor),
  { ssr: false }
);

export default function Home() {
  // Refs
  const inputRef = useRef<HTMLInputElement | null>(null);

  // State
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [createdAt, setCreatedAt] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('生成中…');
  const [error, setError] = useState<string | null>(null);
  const [waitSeconds, setWaitSeconds] = useState(0);

  const isWaiting = waitSeconds > 0;

  // AppShell context
  const shell = useAppShell();
  const addHistoryEntry = shell?.addHistoryEntry;
  const selectedHistoryEntry = shell?.selectedHistoryEntry;
  const clearSelectedHistoryEntry = shell?.clearSelectedHistoryEntry;
  const incrementApiUsage = shell?.incrementApiUsage;

  // Countdown timer
  useEffect(() => {
    if (waitSeconds <= 0) return;
    const timer = setTimeout(() => {
      setWaitSeconds((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [waitSeconds]);

  // Handle history selection
  useEffect(() => {
    if (!selectedHistoryEntry || !clearSelectedHistoryEntry) return;
    setResult(selectedHistoryEntry.result);
    setCreatedAt(selectedHistoryEntry.createdAt);
    setError(null);
    clearSelectedHistoryEntry();
  }, [selectedHistoryEntry, clearSelectedHistoryEntry]);

  // Generate handler
  async function generate() {
    setError(null);
    setResult(null);
    setCreatedAt('');

    if (!imageFile) {
      setError('先に問題画像を撮影（または選択）してください。');
      return;
    }

    setIsLoading(true);
    try {
      setLoadingMessage('画像を最適化中...');
      const optimizedFile = await compressImage(imageFile);

      const formData = new FormData();
      formData.append('image', optimizedFile, optimizedFile.name);

      setLoadingMessage('生成中…');
      const res = await fetch('/api/generate', {
        method: 'POST',
        body: formData,
      });

      const data = (await res.json()) as unknown;

      if (res.status === 429) {
        setWaitSeconds(RATE_LIMIT_WAIT_SECONDS);
        const message =
          typeof data === 'object' && data && 'error' in data
            ? String((data as { error: unknown }).error)
            : '利用制限に達しました。1分ほど間隔を空けてください。';
        throw new Error(message);
      }

      if (!res.ok) {
        const message =
          typeof data === 'object' && data && 'error' in data
            ? String((data as { error: unknown }).error)
            : `Request failed (${res.status})`;
        throw new Error(message);
      }

      const generated = data as GenerateResult;
      const ts = formatNow();
      setResult(generated);
      setCreatedAt(ts);

      if (incrementApiUsage) incrementApiUsage();

      if (addHistoryEntry) {
        addHistoryEntry({
          id: generateId(),
          createdAt: ts,
          result: generated,
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '不明なエラー';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  // Handle file selection
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setImageFile(f);
    setResult(null);
    setError(null);
  }

  const apiUsageCount = shell?.apiUsage?.count ?? 0;
  const apiUsageLimit = shell?.apiUsage?.limit ?? 1500;

  return (
    <>
      {isLoading && <LoadingOverlay message={loadingMessage} />}

      {/* System Gray 6 Background with Ambient Light Orbs */}
      <div className="fixed inset-0 bg-[#F2F2F7] -z-10">
        {/* Ambient Light Orb - Top Right */}
        <div
          className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-40"
          style={{
            background: 'radial-gradient(circle, rgba(0,122,255,0.15) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
        {/* Ambient Light Orb - Bottom Left */}
        <div
          className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full opacity-30"
          style={{
            background: 'radial-gradient(circle, rgba(52,199,89,0.15) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
      </div>

      {/* Frosted Glass Navigation Bar */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-[#F2F2F7]/85 border-b border-white/20">
        <div className="mx-auto max-w-lg px-5 h-14 flex items-center justify-between">
          {/* App Title */}
          <h1 className="text-lg font-bold tracking-tight text-slate-900">
            AI問題変換
          </h1>

          {/* Usage Capsule */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/50 backdrop-blur-sm border border-white/30 shadow-[0_2px_8px_rgb(0,0,0,0.04)]">
            <span className={`w-2 h-2 rounded-full ${apiUsageCount < apiUsageLimit * 0.8 ? 'bg-[#34C759]' : 'bg-[#FF9500]'}`} />
            <span className="font-mono text-sm font-medium text-slate-700">
              {apiUsageCount}/{apiUsageLimit}
            </span>
          </div>
        </div>
      </nav>

      <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-5 py-6">

        {/* Hero Scanner Card */}
        <section className="rounded-[32px] bg-white/70 backdrop-blur-2xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">

          {/* Hidden file input */}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Dropzone Area */}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isLoading}
            className="w-full aspect-[4/3] rounded-[24px] border-2 border-dashed border-slate-200/80 bg-slate-50/50 hover:bg-slate-100/50 hover:border-[#007AFF]/40 transition-all duration-300 flex flex-col items-center justify-center gap-4 group disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {/* Camera Icon Circle */}
            <div className="w-20 h-20 rounded-full bg-[#007AFF]/10 flex items-center justify-center group-hover:bg-[#007AFF]/15 transition-colors">
              <Camera className="w-10 h-10 text-[#007AFF] stroke-[1.5]" />
            </div>

            <div className="text-center">
              <p className="text-base font-semibold text-slate-800">
                問題用紙を撮影
              </p>
              <p className="text-sm text-slate-500 mt-1">
                タップしてカメラを起動
              </p>
            </div>

            {/* File Selected Indicator */}
            {imageFile && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#34C759]/10 border border-[#34C759]/20">
                <span className="w-2 h-2 rounded-full bg-[#34C759]" />
                <span className="text-sm font-medium text-[#34C759] truncate max-w-[200px]">
                  {imageFile.name}
                </span>
              </div>
            )}
          </button>

          {/* Generate Button - iOS Style */}
          <button
            type="button"
            onClick={generate}
            disabled={isLoading || !imageFile || isWaiting}
            className={`
              mt-5 w-full h-14 rounded-full text-base font-semibold
              flex items-center justify-center gap-2
              transition-all duration-200
              active:scale-[0.96]
              disabled:active:scale-100
              ${isWaiting
                ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                : imageFile
                  ? 'bg-[#007AFF] text-white hover:bg-[#0066DD] shadow-[0_4px_14px_rgb(0,122,255,0.25)] disabled:opacity-50'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }
            `}
          >
            {isWaiting ? (
              <>⏳ 再試行まであと {waitSeconds} 秒</>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                類題を生成
              </>
            )}
          </button>

          {/* Countdown Progress */}
          {isWaiting && (
            <div className="mt-4">
              <ProgressBar
                current={waitSeconds}
                total={RATE_LIMIT_WAIT_SECONDS}
                message="AIが休憩中です。あと少しお待ちください。"
              />
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-4 rounded-2xl bg-[#FF3B30]/10 border border-[#FF3B30]/20 p-4">
              <p className="text-sm font-medium text-[#FF3B30]">{error}</p>
            </div>
          )}
        </section>

        {/* Ad Banner Placeholder */}
        <AdBanner slot="main-page-middle" position="middle" enabled={false} />

        {/* Canvas Image Editor */}
        {imageFile && (
          <section className="rounded-[32px] bg-white/70 backdrop-blur-2xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 animate-fadeIn">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-4">
              <span className="w-8 h-8 rounded-xl bg-[#5856D6]/10 flex items-center justify-center">
                🖼️
              </span>
              画像編集
            </h2>
            <CanvasImageEditor
              imageFile={imageFile}
              onComplete={() => incrementApiUsage?.()}
            />
          </section>
        )}

        {/* Results Section - iOS Inset Grouped Style */}
        {result && (
          <section className="rounded-[32px] bg-white/70 backdrop-blur-2xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden animate-fadeIn">
            {/* Section Header */}
            <div className="px-6 pt-6 pb-4">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-[#FF9500]/10 flex items-center justify-center">
                  📝
                </span>
                生成結果
              </h2>
            </div>

            {/* Results List - Inset Grouped */}
            <div className="mx-4 mb-4 rounded-2xl bg-white/60 border border-white/40 divide-y divide-slate-200/50 overflow-hidden">
              {result.map((problem, idx) => (
                <div
                  key={problem.id}
                  className="flex items-center justify-between px-4 py-3.5 hover:bg-slate-50/50 transition-colors cursor-pointer group"
                  style={{
                    animationDelay: `${idx * 80}ms`,
                    animation: 'fadeSlideIn 0.4s ease-out forwards',
                    opacity: 0,
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <ProblemCard
                      problem={problem}
                      index={idx}
                      isLast={idx === result.length - 1}
                    />
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-400 transition-colors flex-shrink-0 ml-2" />
                </div>
              ))}
            </div>

            {/* PDF Download Button */}
            <div className="px-6 pb-6">
              <PdfDownloadButton result={result} createdAt={createdAt} />
            </div>
          </section>
        )}
      </main>

      {/* CSS Animations */}
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
          0%, 100% { transform: translateY(-100%); }
          50% { transform: translateY(100%); }
        }

        .scanning-animation {
          animation: scanning 2s ease-in-out infinite;
        }
      `}</style>
    </>
  );
}
