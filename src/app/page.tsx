"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { GenerateResult } from "@/lib/types";
import { useAppShell } from "@/components/AppShell";

const PdfDownloadButton = dynamic(
  () =>
    import("@/components/PdfDownloadButton").then((m) => m.PdfDownloadButton),
  { ssr: false }
);

export default function Home() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [createdAt, setCreatedAt] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waitSeconds, setWaitSeconds] = useState(0);

  const WAIT_TOTAL_SECONDS = 60;
  const isWaiting = waitSeconds > 0;

  const { addHistoryEntry, selectedHistoryEntry, clearSelectedHistoryEntry } =
    useAppShell();

  // カウントダウンタイマー
  useEffect(() => {
    if (waitSeconds <= 0) return;
    const timer = setTimeout(() => {
      setWaitSeconds((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [waitSeconds]);

  // 履歴から選択されたら、結果を再表示
  useEffect(() => {
    if (!selectedHistoryEntry) return;
    setResult(selectedHistoryEntry.result);
    setCreatedAt(selectedHistoryEntry.createdAt);
    setError(null);
    clearSelectedHistoryEntry();
  }, [selectedHistoryEntry, clearSelectedHistoryEntry]);

  function formatNow(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${d} ${hh}:${mm}`;
  }

  async function generate() {
    setError(null);
    setResult(null);
    setCreatedAt("");

    if (!imageFile) {
      setError("先に問題画像を撮影（または選択）してください。\n");
      return;
    }

    const formData = new FormData();
    formData.append("image", imageFile);

    setIsLoading(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        body: formData,
      });

      const data = (await res.json()) as unknown;

      // 429 レート制限エラーの処理
      if (res.status === 429) {
        setWaitSeconds(WAIT_TOTAL_SECONDS);
        const message =
          typeof data === "object" && data && "error" in data
            ? String((data as { error: unknown }).error)
            : "利用制限に達しました。1分ほど間隔を空けてください。";
        throw new Error(message);
      }

      if (!res.ok) {
        const message =
          typeof data === "object" && data && "error" in data
            ? String((data as { error: unknown }).error)
            : `Request failed (${res.status})`;
        throw new Error(message);
      }

      const generated = data as GenerateResult;
      const ts = formatNow();
      setResult(generated);
      setCreatedAt(ts);

      const id =
        typeof crypto !== "undefined" &&
        typeof (crypto as Crypto).randomUUID === "function"
          ? (crypto as Crypto).randomUUID()
          : String(Date.now());

      addHistoryEntry({ id, createdAt: ts, result: generated });
    } catch (e) {
      const message = e instanceof Error ? e.message : "不明なエラー";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      {isLoading ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[92%] max-w-sm rounded-2xl bg-white p-6 text-center">
            <div
              className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-900"
              aria-label="loading"
            />
            <p className="text-sm font-medium text-zinc-900">生成中…</p>
            <p className="mt-1 text-xs text-zinc-600">操作をロックしています</p>
          </div>
        </div>
      ) : null}

      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold text-zinc-900">AI問題変換</h1>
          <p className="text-sm text-zinc-600">
            問題用紙を撮影すると、数値だけ変えた類題を作成します。
          </p>
        </header>

        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <div className="flex flex-col gap-3">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setImageFile(f);
                setResult(null);
                setError(null);
              }}
            />

            <button
              type="button"
              className="h-12 w-full rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
              onClick={() => inputRef.current?.click()}
              disabled={isLoading}
            >
              カメラで撮影（または画像を選択）
            </button>

            <button
              type="button"
              className={
                isWaiting
                  ? "h-12 w-full rounded-xl bg-zinc-100 px-4 text-sm font-semibold text-zinc-500 ring-1 ring-inset ring-zinc-200"
                  : "h-12 w-full rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              }
              onClick={generate}
              disabled={isLoading || !imageFile || isWaiting}
            >
              {isWaiting ? `再試行まであと ${waitSeconds} 秒` : "類題を生成"}
            </button>

            {isWaiting ? (
              <div className="-mt-1">
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-zinc-200"
                  aria-label="retry countdown"
                >
                  <div
                    className="h-full bg-blue-500 transition-all duration-1000 ease-linear"
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(100, (waitSeconds / WAIT_TOTAL_SECONDS) * 100)
                      )}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-zinc-600">
                  現在、AIが休憩中です。あと少しで次の問題を作成できます。
                </p>
              </div>
            ) : null}

            {imageFile ? (
              <p className="text-xs text-zinc-600">選択中: {imageFile.name}</p>
            ) : (
              <p className="text-xs text-zinc-600">
                まずは問題用紙を撮影してください。
              </p>
            )}

            {error ? (
              <p className="whitespace-pre-wrap text-sm font-medium text-red-600">
                {error}
              </p>
            ) : null}
          </div>
        </section>

        {result ? (
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <h2 className="text-sm font-semibold text-zinc-900">生成結果</h2>

            <div className="mt-3 space-y-3">
              <div className="rounded-xl bg-zinc-50 p-3">
                <p className="text-xs font-semibold text-zinc-700">問題</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-900">
                  {result.new_problem.problem_text}
                </p>
              </div>

              <div className="rounded-xl bg-zinc-50 p-3">
                <p className="text-xs font-semibold text-zinc-700">模範解答</p>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-zinc-900">
                  {result.solution.steps.map((s, idx) => (
                    <li key={idx} className="whitespace-pre-wrap">
                      {s}
                    </li>
                  ))}
                </ol>
                <p className="mt-3 text-sm font-semibold text-zinc-900">
                  答え: {result.solution.final_answer}
                </p>
              </div>

              <PdfDownloadButton result={result} createdAt={createdAt} />
            </div>
          </section>
        ) : null}
      </main>
    </>
  );
}
