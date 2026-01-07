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

      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold text-zinc-900">AI問題変換</h1>
          <p className="text-sm text-zinc-600">
            問題用紙を撮影すると、数値だけ変えた類題を作成します。
          </p>
          {/* API使用状況バッジ */}
          {shell && (
            <div className="pt-2">
              <UsageStatsBadge
                count={shell.apiUsage?.count ?? 0}
                limit={shell.apiUsage?.limit ?? 1500}
                hydrated={shell.apiUsage?.hydrated ?? false}
              />
            </div>
          )}
        </header>

        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <div className="flex flex-col gap-3">
            {/* Hidden file input */}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Camera button */}
            <button
              type="button"
              className="h-12 w-full rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
              onClick={() => inputRef.current?.click()}
              disabled={isLoading}
            >
              カメラで撮影（または画像を選択）
            </button>

            {/* Generate button */}
            <button
              type="button"
              className={
                isWaiting
                  ? 'h-12 w-full rounded-xl bg-zinc-100 px-4 text-sm font-semibold text-zinc-500 ring-1 ring-inset ring-zinc-200'
                  : 'h-12 w-full rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50'
              }
              onClick={generate}
              disabled={isLoading || !imageFile || isWaiting}
            >
              {isWaiting ? `再試行まであと ${waitSeconds} 秒` : '類題を生成'}
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
            {imageFile ? (
              <p className="text-xs text-zinc-600">選択中: {imageFile.name}</p>
            ) : (
              <p className="text-xs text-zinc-600">
                まずは問題用紙を撮影してください。
              </p>
            )}

            {/* Error message */}
            {error && (
              <p className="whitespace-pre-wrap text-sm font-medium text-red-600">
                {error}
              </p>
            )}
          </div>
        </section>

        {/* Canvas Image Editor */}
        {imageFile && (
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <h2 className="mb-3 text-sm font-semibold text-zinc-900">
              🖼️ 画像編集
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

        {/* Results section */}
        {result && (
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <h2 className="text-sm font-semibold text-zinc-900">生成結果</h2>

            <div className="mt-3 space-y-4">
              {result.map((problem, idx) => (
                <ProblemCard
                  key={problem.id}
                  problem={problem}
                  index={idx}
                  isLast={idx === result.length - 1}
                />
              ))}

              <PdfDownloadButton result={result} createdAt={createdAt} />
            </div>
          </section>
        )}
      </main>
    </>
  );
}
