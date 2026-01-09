'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Download, ImageIcon, Loader2, Sparkles, X } from 'lucide-react';
import { useAppShell } from '@/components/AppShell';
import { AdBanner } from '@/components/ads/AdBanner';
import { smartEraseAndReplace, canvasToBlob, type DetectedNumber } from '@/lib/smartErase';

// =====================================
// Types
// =====================================

interface DetectionResponse {
  numbers: DetectedNumber[];
  success: boolean;
  error?: string;
}

// =====================================
// Component
// =====================================

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Core State
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  // AppShell context
  const shell = useAppShell();
  const { incrementApiUsage, apiUsage } = shell ?? {};
  const apiUsageCount = apiUsage?.count ?? 0;
  const apiUsageLimit = apiUsage?.limit ?? 1500;

  // プレビューURL生成 & クリーンアップ
  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  // 処理済みURLのクリーンアップ
  useEffect(() => {
    return () => {
      if (processedUrl) {
        URL.revokeObjectURL(processedUrl);
      }
    };
  }, [processedUrl]);

  // ファイル選択
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    setProcessedUrl(null);
    setError(null);
  }, []);

  // ファイルをクリア
  const clearFile = useCallback(() => {
    setImageFile(null);
    setProcessedUrl(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  // 数字検出 + Smart Erase 処理
  const processImage = useCallback(async () => {
    if (!imageFile || !canvasRef.current) return;

    setIsProcessing(true);
    setError(null);
    setProcessedUrl(null);

    try {
      // Step 1: 画像をCanvasに描画
      setStatusMessage('画像を読み込み中...');
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context を取得できませんでした');

      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
        img.src = URL.createObjectURL(imageFile);
      });

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(img.src);

      // Step 2: 画像データをBase64に変換
      setStatusMessage('数字を検出中...');
      const base64 = canvas.toDataURL('image/png').split(',')[1];

      // Step 3: Gemini API で数字検出
      const response = await fetch('/api/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: 'image/png',
          imageWidth: canvas.width,
          imageHeight: canvas.height,
        }),
      });

      const data = (await response.json()) as DetectionResponse;

      if (!response.ok) {
        throw new Error(data.error || `検出に失敗しました (${response.status})`);
      }

      if (!data.numbers || data.numbers.length === 0) {
        throw new Error('数字が検出されませんでした。別の画像をお試しください。');
      }

      // Step 4: Smart Erase + Random Number Replacement 実行
      setStatusMessage(`${data.numbers.length} 個の数字を変換中...`);
      const replacements = smartEraseAndReplace(ctx, data.numbers, { padding: 2, minBrightness: 200 });
      console.log('[processImage] Replacements:', Object.fromEntries(replacements));

      // Step 5: 結果を生成
      setStatusMessage('画像を生成中...');
      const blob = await canvasToBlob(canvas);
      const resultUrl = URL.createObjectURL(blob);
      setProcessedUrl(resultUrl);

      // API使用量をインクリメント
      incrementApiUsage?.();

    } catch (e) {
      setError(e instanceof Error ? e.message : '不明なエラーが発生しました');
    } finally {
      setIsProcessing(false);
      setStatusMessage('');
    }
  }, [imageFile, incrementApiUsage]);

  // ダウンロード処理
  const handleDownload = useCallback(() => {
    if (!processedUrl) return;
    const a = document.createElement('a');
    a.href = processedUrl;
    a.download = `erased-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [processedUrl]);

  // 使用量のステータス色
  const usageStatusColor = useMemo(
    () => (apiUsageCount < apiUsageLimit * 0.8 ? 'bg-[#34C759]' : 'bg-[#FF9500]'),
    [apiUsageCount, apiUsageLimit]
  );

  return (
    <>
      {/* 背景 */}
      <div className="fixed inset-0 bg-[#F2F2F7] -z-10">
        <div
          className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-40"
          style={{
            background: 'radial-gradient(circle, rgba(0,122,255,0.15) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
        <div
          className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full opacity-30"
          style={{
            background: 'radial-gradient(circle, rgba(52,199,89,0.15) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
      </div>

      {/* Hidden canvas for processing */}
      <canvas ref={canvasRef} className="hidden" />

      <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-5 py-6">
        {/* タイトル */}
        <div className="text-center pt-2">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">AI問題変換</h1>
          <p className="text-sm text-slate-600 mt-1">
            問題用紙を撮影すると、数値だけ変えた類題を作成します
          </p>
          {/* API使用状況 */}
          <div className="flex justify-center mt-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/50 backdrop-blur-sm border border-white/30 shadow-sm">
              <span className={`w-2 h-2 rounded-full ${usageStatusColor}`} />
              <span className="font-mono text-sm font-medium text-slate-700">
                {apiUsageCount}/{apiUsageLimit}
              </span>
            </div>
          </div>
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
          <div className="relative">
            {previewUrl ? (
              // 画像プレビュー
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
                  disabled={isProcessing}
                  className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/70 transition-colors active:scale-95 disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
                {/* 変更ボタン */}
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={isProcessing}
                  className="absolute bottom-3 right-3 px-4 py-2 rounded-full bg-white/80 backdrop-blur-md flex items-center gap-2 text-sm font-medium text-slate-700 hover:bg-white transition-colors active:scale-95 disabled:opacity-50 shadow-lg"
                >
                  <ImageIcon className="w-4 h-4" />
                  変更
                </button>
              </div>
            ) : (
              // アップロード促進
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={isProcessing}
                className="w-full aspect-[4/3] flex flex-col items-center justify-center gap-4 group transition-all duration-300 hover:bg-slate-50/50 active:scale-[0.98] disabled:opacity-50"
              >
                <div className="w-20 h-20 rounded-full bg-[#007AFF]/10 flex items-center justify-center group-hover:bg-[#007AFF]/15 transition-colors">
                  <Camera className="w-10 h-10 text-[#007AFF] stroke-[1.5]" />
                </div>
                <div className="text-center">
                  <p className="text-base font-semibold text-slate-800">
                    カメラで撮影（または画像を選択）
                  </p>
                  <p className="text-sm text-slate-500 mt-1">
                    タップしてカメラまたはアルバムから選択
                  </p>
                </div>
              </button>
            )}
          </div>

          {/* 生成ボタン - 画像がある時のみ表示 */}
          {imageFile && !processedUrl && (
            <div className="p-4 pt-0">
              <button
                type="button"
                onClick={processImage}
                disabled={isProcessing}
                className={`
                  relative w-full h-14 rounded-full text-base font-semibold overflow-hidden
                  flex items-center justify-center gap-2 transition-all duration-200
                  active:scale-[0.96] disabled:active:scale-100
                  bg-[#007AFF] text-white hover:bg-[#0066DD] shadow-[0_4px_14px_rgb(0,122,255,0.25)] disabled:opacity-70
                `}
              >
                {/* スキャンアニメーション */}
                {!isProcessing && (
                  <div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                    style={{ animation: 'scanning 2s ease-in-out infinite' }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {statusMessage || '処理中...'}
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      類題を生成
                    </>
                  )}
                </span>
              </button>
            </div>
          )}

          {/* エラー */}
          {error && (
            <div className="mx-4 mb-4 rounded-2xl bg-[#FF3B30]/10 border border-[#FF3B30]/20 p-4">
              <p className="text-sm font-medium text-[#FF3B30]">{error}</p>
            </div>
          )}
        </section>

        {/* 広告スペース */}
        <AdBanner slot="main-page-middle" position="middle" enabled={false} />

        {/* 処理結果 */}
        {processedUrl && (
          <section className="rounded-[32px] bg-white/70 backdrop-blur-2xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden animate-fadeIn">
            <div className="p-4 pb-0">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-[#34C759]/10 flex items-center justify-center">
                  ✅
                </span>
                処理完了
              </h2>
            </div>

            <div className="p-4">
              <div className="rounded-2xl overflow-hidden bg-slate-100">
                <img
                  src={processedUrl}
                  alt="処理済み画像"
                  className="w-full h-auto object-contain"
                />
              </div>
            </div>

            <div className="px-4 pb-4">
              <button
                type="button"
                onClick={handleDownload}
                className="w-full h-12 rounded-full bg-[#34C759] text-white font-semibold flex items-center justify-center gap-2 hover:bg-[#2FB350] transition-colors active:scale-[0.98] shadow-[0_4px_14px_rgb(52,199,89,0.25)]"
              >
                <Download className="w-5 h-5" />
                画像をダウンロード
              </button>
            </div>

            {/* 新しい画像で再処理 */}
            <div className="px-4 pb-4 pt-0">
              <button
                type="button"
                onClick={clearFile}
                className="w-full h-10 rounded-full bg-slate-100 text-slate-700 font-medium text-sm flex items-center justify-center gap-2 hover:bg-slate-200 transition-colors active:scale-[0.98]"
              >
                別の画像で試す
              </button>
            </div>
          </section>
        )}

        {/* 選択中のファイル名表示 */}
        {imageFile && !processedUrl && (
          <div className="flex items-center justify-center gap-2 text-sm text-slate-600">
            <span className="w-2 h-2 rounded-full bg-[#34C759]" />
            <span>選択中: {imageFile.name}</span>
          </div>
        )}
      </main>

      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out forwards;
        }
        @keyframes scanning {
          0%,
          100% {
            transform: translateX(-100%);
          }
          50% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </>
  );
}
