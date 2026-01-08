'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GenerateResult } from '@/types';
import { useAppShell } from '@/components/AppShell';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { UsageStatsBadge } from '@/components/ui/UsageStatsBadge';
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

  // 置換数値を生成（Canvas画像エディタ用）
  const generateReplacements = useCallback(
    async (numbers: string[]): Promise<{ original: string; replacement: string }[]> => {
      const res = await fetch('/api/replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numbers }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || 'Failed to generate replacements');
      }

      // API使用回数をインクリメント
      if (incrementApiUsage) {
        incrementApiUsage();
      }

      return res.json();
    },
    [incrementApiUsage]
  );

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
      setError('先に問題画像を撮影（または選択）してください。\n');
      return;
    }

    setIsLoading(true);
    try {
      // 画像圧縮
      setLoadingMessage('画像を最適化中...');
      const optimizedFile = await compressImage(imageFile);

      // API呼び出し
      const formData = new FormData();
      formData.append('image', optimizedFile, optimizedFile.name);

      setLoadingMessage('生成中…');
      const res = await fetch('/api/generate', {
        method: 'POST',
        body: formData,
      });

      const data = (await res.json()) as unknown;

      // レートリミットエラー
      if (res.status === 429) {
        setWaitSeconds(RATE_LIMIT_WAIT_SECONDS);
        const message =
          typeof data === 'object' && data && 'error' in data
            ? String((data as { error: unknown }).error)
            : '利用制限に達しました。1分ほど間隔を空けてください。';
        throw new Error(message);
      }

      // その他のエラー
      if (!res.ok) {
        const message =
          typeof data === 'object' && data && 'error' in data
            ? String((data as { error: unknown }).error)
            : `Request failed (${res.status})`;
        throw new Error(message);
      }

      // 成功
      const generated = data as GenerateResult;
      const ts = formatNow();
      setResult(generated);
      setCreatedAt(ts);

      // API使用回数をインクリメント
      if (incrementApiUsage) {
        incrementApiUsage();
      }

      // 履歴に追加
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

  return (
    <>
      {isLoading && <LoadingOverlay message={loadingMessage} />}

      <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-5 py-8">
        {/* Header Section */}
        <header className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            AI問題変換
          </h1>
          <p className="text-base text-slate-600">
            問題用紙を撮影すると、数値だけ変えた類題を作成します
          </p>
          {/* API使用状況バッジ */}
          {shell && (
            <div className="pt-3 flex justify-center">
              <UsageStatsBadge
                count={shell.apiUsage?.count ?? 0}
                limit={shell.apiUsage?.limit ?? 1500}
                hydrated={shell.apiUsage?.hydrated ?? false}
              />
            </div>
          )}
        </header>

        {/* Main Card - Glassmorphism */}
        <section className="rounded-[32px] bg-white/70 backdrop-blur-2xl border border-white/40 shadow-xl shadow-black/5 p-6">
          <div className="flex flex-col gap-4">
            {/* Hidden file input */}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Camera button - Pill shaped with bounce */}
            <button
              type="button"
              className="h-14 w-full rounded-full bg-slate-900 px-6 text-base font-semibold text-white active:scale-95 transition-transform duration-150 disabled:opacity-50 disabled:active:scale-100"
              onClick={() => inputRef.current?.click()}
              disabled={isLoading}
            >
              📷 カメラで撮影（または画像を選択）
            </button>

            {/* Generate button - Apple Blue pill */}
            <button
              type="button"
              className={
                isWaiting
                  ? 'h-14 w-full rounded-full bg-slate-100 px-6 text-base font-semibold text-slate-500 border border-slate-200'
                  : 'h-14 w-full rounded-full bg-[#007AFF] px-6 text-base font-semibold text-white active:scale-95 transition-transform duration-150 hover:bg-[#0066DD] disabled:opacity-50 disabled:active:scale-100'
              }
              onClick={generate}
              disabled={isLoading || !imageFile || isWaiting}
            >
              {isWaiting ? `⏳ 再試行まであと ${waitSeconds} 秒` : '✨ 類題を生成'}
            </button>

            {/* Countdown progress bar */}
            {isWaiting && (
              <ProgressBar
                current={waitSeconds}
                total={RATE_LIMIT_WAIT_SECONDS}
                message="現在、AIが休憩中です。あと少しで次の問題を作成できます。"
              />
            )}

            {/* File status */}
            <div className="text-center">
              {imageFile ? (
                <p className="text-sm text-slate-600 flex items-center justify-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                  選択中: {imageFile.name}
                </p>
              ) : (
                <p className="text-sm text-slate-500">
                  まずは問題用紙を撮影してください
                </p>
              )}
            </div>

            {/* Error message */}
            {error && (
              <div className="rounded-2xl bg-red-50/80 backdrop-blur-sm border border-red-200/50 p-4">
                <p className="whitespace-pre-wrap text-sm font-medium text-red-600">
                  {error}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Ad Banner - Conditionally rendered */}
        <AdBanner
          slot="main-page-middle"
          position="middle"
          enabled={false} // 広告を有効にするにはtrueに変更
        />

        {/* Canvas Image Editor - Glassmorphism Card */}
        {imageFile && (
          <section
            className="rounded-[32px] bg-white/70 backdrop-blur-2xl border border-white/40 shadow-xl shadow-black/5 p-6 animate-in fade-in slide-in-from-bottom-4 duration-500"
          >
            <h2 className="mb-4 text-lg font-semibold text-slate-900 flex items-center gap-2">
              <span>🖼️</span> 画像編集
            </h2>
            <CanvasImageEditor
              imageFile={imageFile}
              onComplete={() => {
                if (incrementApiUsage) {
                  incrementApiUsage();
                }
              }}
            />
          </section>
        )}

        {/* Results section - Glassmorphism Card with animation */}
        {result && (
          <section
            className="rounded-[32px] bg-white/70 backdrop-blur-2xl border border-white/40 shadow-xl shadow-black/5 p-6 animate-in fade-in slide-in-from-bottom-4 duration-500"
          >
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <span>📝</span> 生成結果
            </h2>

            <div className="mt-4 space-y-4">
              {result.map((problem, idx) => (
                <div
                  key={problem.id}
                  className="animate-in fade-in slide-in-from-bottom-2"
                  style={{ animationDelay: `${idx * 100}ms`, animationFillMode: 'both' }}
                >
                  <ProblemCard
                    problem={problem}
                    index={idx}
                    isLast={idx === result.length - 1}
                  />
                </div>
              ))}

              <div className="pt-2">
                <PdfDownloadButton result={result} createdAt={createdAt} />
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Scanning Animation Keyframes - injected as style tag */}
      <style jsx global>{`
        @keyframes scanning {
          0% {
            transform: translateY(-100%);
          }
          100% {
            transform: translateY(100%);
          }
        }

        .scanning-animation {
          animation: scanning 1.5s ease-in-out infinite;
        }

        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slide-in-from-bottom-4 {
          from {
            transform: translateY(16px);
          }
          to {
            transform: translateY(0);
          }
        }

        @keyframes slide-in-from-bottom-2 {
          from {
            transform: translateY(8px);
          }
          to {
            transform: translateY(0);
          }
        }

        .animate-in {
          animation: fade-in 0.5s ease-out, slide-in-from-bottom-4 0.5s ease-out;
        }
      `}</style>
    </>
  );
}
