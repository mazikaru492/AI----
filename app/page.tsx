"use client";

import { useState, useRef } from "react";
import { GeneratedProblem, ApiResponse } from "@/lib/types";
import dynamic from "next/dynamic";

// PDFコンポーネントを動的インポート（SSR無効化）
const PDFDownloadButton = dynamic(
  () => import("@/components/PDFDownloadButton"),
  { ssr: false }
);

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<GeneratedProblem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCapture = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // プレビュー表示
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewImage(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // API呼び出し
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch("/api/generate", {
        method: "POST",
        body: formData,
      });

      const data: ApiResponse = await response.json();

      if (data.success && data.data) {
        setResult(data.data);
      } else {
        setError(data.error || "問題の生成に失敗しました");
      }
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    setPreviewImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <main className="min-h-screen p-4 pb-20">
      {/* ローディングオーバーレイ */}
      {isLoading && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="glass rounded-2xl p-8 text-center loading-glow">
            <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-lg font-medium">AIが問題を解析中...</p>
            <p className="text-sm text-gray-400 mt-2">しばらくお待ちください</p>
          </div>
        </div>
      )}

      {/* ヘッダー */}
      <header className="text-center mb-8 pt-4">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
          数学類題ジェネレーター
        </h1>
        <p className="text-gray-400 text-sm mt-2">
          問題を撮影 → AIが類題を自動作成
        </p>
      </header>

      {/* メインコンテンツ */}
      <div className="max-w-lg mx-auto space-y-6">
        {/* 撮影ボタン */}
        {!result && (
          <div className="glass rounded-2xl p-6">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />

            <button
              onClick={handleCapture}
              disabled={isLoading}
              className="btn-primary w-full py-4 rounded-xl text-lg font-semibold flex items-center justify-center gap-3"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              問題を撮影する
            </button>

            {/* プレビュー */}
            {previewImage && (
              <div className="mt-4">
                <img
                  src={previewImage}
                  alt="撮影した問題"
                  className="w-full rounded-lg border border-white/10"
                />
              </div>
            )}
          </div>
        )}

        {/* エラー表示 */}
        {error && (
          <div className="glass rounded-2xl p-4 border-red-500/50 border">
            <p className="text-red-400 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {error}
            </p>
            <button
              onClick={handleReset}
              className="mt-3 text-sm text-indigo-400 hover:text-indigo-300 transition"
            >
              もう一度試す
            </button>
          </div>
        )}

        {/* 結果表示 */}
        {result && (
          <div className="space-y-4">
            {/* 元の問題 */}
            <div className="glass rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-gray-400 mb-2 flex items-center gap-2">
                <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                元の問題
              </h2>
              <p className="text-gray-300 whitespace-pre-wrap">{result.originalProblem}</p>
            </div>

            {/* 新しい問題 */}
            <div className="glass rounded-2xl p-5 border border-indigo-500/30">
              <h2 className="text-sm font-semibold text-indigo-400 mb-2 flex items-center gap-2">
                <span className="w-2 h-2 bg-indigo-400 rounded-full"></span>
                新しい問題（生成）
              </h2>
              <p className="text-white whitespace-pre-wrap">{result.newProblem}</p>
            </div>

            {/* 模範解答 */}
            <div className="glass rounded-2xl p-5 border border-green-500/30">
              <h2 className="text-sm font-semibold text-green-400 mb-2 flex items-center gap-2">
                <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                模範解答
              </h2>
              <p className="text-gray-300 mb-3">{result.solution}</p>
              <div className="space-y-2 pl-4 border-l-2 border-green-500/30">
                {result.steps.map((step, index) => (
                  <p key={index} className="text-sm text-gray-400">
                    <span className="text-green-400 font-mono">Step {index + 1}:</span> {step}
                  </p>
                ))}
              </div>
              <div className="mt-4 p-3 bg-green-500/10 rounded-lg">
                <p className="text-green-400 font-semibold">
                  答え: {result.answer}
                </p>
              </div>
            </div>

            {/* アクションボタン */}
            <div className="flex gap-3">
              <PDFDownloadButton problem={result} />
              <button
                onClick={handleReset}
                className="flex-1 py-3 rounded-xl border border-white/20 text-gray-300 hover:bg-white/5 transition font-medium"
              >
                別の問題を撮影
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
