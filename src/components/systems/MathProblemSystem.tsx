"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  Download,
  ImageIcon,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { useAppShell } from "@/components/AppShell";
import { AdBanner } from "@/components/ads/AdBanner";
import {
  smartEraseAndReplace,
  canvasToBlob,
  type DetectedNumber,
} from "@/lib/smartErase";
import { compressImage, MAX_IMAGE_UPLOAD_BYTES } from "@/lib/imageCompression";

interface DetectionResponse {
  numbers: DetectedNumber[];
  success: boolean;
  error?: string;
}

interface MathProblemSystemProps {
  onBack: () => void;
}

const MAX_BASE64_SAFE_FILE_BYTES = Math.floor(MAX_IMAGE_UPLOAD_BYTES * 0.72);

export function MathProblemSystem({ onBack }: MathProblemSystemProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  const shell = useAppShell();
  const { incrementApiUsage, apiUsage, addHistoryEntry } = shell ?? {};
  const apiUsageCount = apiUsage?.count ?? 0;
  const apiUsageLimit = apiUsage?.limit ?? 1500;

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    return () => {
      if (processedUrl) {
        URL.revokeObjectURL(processedUrl);
      }
    };
  }, [processedUrl]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      setImageFile(file);
      setProcessedUrl(null);
      setError(null);
    },
    [],
  );

  const clearFile = useCallback(() => {
    setImageFile(null);
    setProcessedUrl(null);
    setError(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const openCameraPicker = useCallback(() => {
    cameraInputRef.current?.click();
  }, []);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const processImage = useCallback(async () => {
    if (!imageFile || !canvasRef.current) return;

    setIsProcessing(true);
    setError(null);
    setProcessedUrl(null);

    try {
      const SCALE_FACTOR = 2;

      setStatusMessage("画像を読み込み中...");
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context を取得できませんでした");

      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
        img.src = URL.createObjectURL(imageFile);
      });

      const originalWidth = img.width;
      const originalHeight = img.height;

      canvas.width = originalWidth * SCALE_FACTOR;
      canvas.height = originalHeight * SCALE_FACTOR;

      ctx.scale(SCALE_FACTOR, SCALE_FACTOR);
      ctx.drawImage(img, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      URL.revokeObjectURL(img.src);

      setStatusMessage("数字を検出中...");
      const detectionFile =
        imageFile.size > MAX_BASE64_SAFE_FILE_BYTES
          ? await compressImage(imageFile)
          : imageFile;
      const detectionImg = new Image();
      await new Promise<void>((resolve, reject) => {
        detectionImg.onload = () => resolve();
        detectionImg.onerror = () =>
          reject(new Error("検出用画像の読み込みに失敗しました"));
        detectionImg.src = URL.createObjectURL(detectionFile);
      });
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () =>
          reject(new Error("検出用画像のエンコードに失敗しました"));
        reader.readAsDataURL(detectionFile);
      });
      const base64 = dataUrl.split(",")[1] ?? "";
      URL.revokeObjectURL(detectionImg.src);
      if (!base64) {
        throw new Error("検出用画像のデータ生成に失敗しました。");
      }

      const apiPayload = JSON.stringify({
        imageBase64: base64,
        mimeType: detectionFile.type || "image/jpeg",
        imageWidth: detectionImg.width,
        imageHeight: detectionImg.height,
      });

      const response = await fetch("/api/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: apiPayload,
      });
      const rawResponse = await response.text();
      let data: DetectionResponse | null = null;
      try {
        data = rawResponse
          ? (JSON.parse(rawResponse) as DetectionResponse)
          : null;
      } catch {
        data = null;
      }

      if (!response.ok) {
        if (
          response.status === 413 ||
          /request entity too large/i.test(rawResponse)
        ) {
          throw new Error(
            "画像サイズが大きすぎます。画像を小さくして再度お試しください。",
          );
        }
        const plainResponse = rawResponse
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        const resolvedError =
          data?.error ||
          plainResponse ||
          `検出に失敗しました (${response.status})`;
        if (
          /request entity too large|payload too large|unexpected token.*request en/i.test(
            resolvedError,
          )
        ) {
          throw new Error(
            "画像サイズが大きすぎます。画像を小さくして再度お試しください。",
          );
        }
        throw new Error(resolvedError);
      }
      if (!data) {
        throw new Error("サーバーから不正な形式のレスポンスが返されました。");
      }
      const detectedNumbers = data.numbers;

      if (!detectedNumbers || detectedNumbers.length === 0) {
        throw new Error(
          "数字が検出されませんでした。数字を含む教科書・問題集の画像をお試しください。",
        );
      }

      const toOriginalScaleX = originalWidth / detectionImg.width;
      const toOriginalScaleY = originalHeight / detectionImg.height;
      const scaledNumbers = detectedNumbers.map((n) => ({
        text: n.text,
        bbox: {
          x: n.bbox.x * toOriginalScaleX * SCALE_FACTOR,
          y: n.bbox.y * toOriginalScaleY * SCALE_FACTOR,
          width: n.bbox.width * toOriginalScaleX * SCALE_FACTOR,
          height: n.bbox.height * toOriginalScaleY * SCALE_FACTOR,
        },
        baselineY: n.baselineY
          ? n.baselineY * toOriginalScaleY * SCALE_FACTOR
          : undefined,
        fontStyle: n.fontStyle,
        role: n.role,
        parentChar: n.parentChar,
        charBboxes: n.charBboxes?.map((cb) => ({
          char: cb.char,
          xmin: cb.xmin * toOriginalScaleX * SCALE_FACTOR,
          xmax: cb.xmax * toOriginalScaleX * SCALE_FACTOR,
        })),
      }));

      setStatusMessage(`${detectedNumbers.length} 個の数字を変換中...`);
      const replacements = smartEraseAndReplace(ctx, scaledNumbers, {
        padding: 2 * SCALE_FACTOR,
        minBrightness: 200,
        minFontSize: 10 * SCALE_FACTOR,
        smallBoxThreshold: 20 * SCALE_FACTOR,
      });
      console.log(
        "[processImage] Replacements:",
        Object.fromEntries(replacements),
      );

      setStatusMessage("画像を生成中...");
      const blob = await canvasToBlob(canvas);
      const resultUrl = URL.createObjectURL(blob);
      setProcessedUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return resultUrl;
      });

      incrementApiUsage?.();

      addHistoryEntry?.({
        id: crypto.randomUUID(),
        createdAt: new Date().toLocaleString("ja-JP", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }),
        summary: "問題の数値を変換しました",
        numbersDetected: detectedNumbers.length,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラーが発生しました");
    } finally {
      setIsProcessing(false);
      setStatusMessage("");
    }
  }, [imageFile, incrementApiUsage, addHistoryEntry]);

  const handleDownload = useCallback(() => {
    if (!processedUrl) return;
    const a = document.createElement("a");
    a.href = processedUrl;
    a.download = `erased-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [processedUrl]);

  const usageStatusColor = useMemo(
    () =>
      apiUsageCount < apiUsageLimit * 0.8 ? "bg-[#34C759]" : "bg-[#FF9500]",
    [apiUsageCount, apiUsageLimit],
  );

  return (
    <>
      <div className="fixed inset-0 bg-[#F2F2F7] -z-10">
        <div
          className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-40"
          style={{
            background:
              "radial-gradient(circle, rgba(0,122,255,0.15) 0%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />
        <div
          className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full opacity-30"
          style={{
            background:
              "radial-gradient(circle, rgba(52,199,89,0.15) 0%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-5 py-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          システム選択に戻る
        </button>

        <div className="text-center pt-2">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            AI問題変換
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            問題用紙を撮影すると、数値だけ変えた類題を作成します
          </p>
          <div className="flex justify-center mt-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/50 backdrop-blur-sm border border-white/30 shadow-sm">
              <span className={`w-2 h-2 rounded-full ${usageStatusColor}`} />
              <span className="font-mono text-sm font-medium text-slate-700">
                {apiUsageCount}/{apiUsageLimit}
              </span>
            </div>
          </div>
        </div>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        <section className="rounded-[32px] bg-white/70 backdrop-blur-2xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="relative">
            {previewUrl ? (
              <div className="relative aspect-[4/3] bg-slate-100">
                <img
                  src={previewUrl}
                  alt="プレビュー"
                  className="w-full h-full object-contain"
                />
                <button
                  type="button"
                  onClick={clearFile}
                  disabled={isProcessing}
                  className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/70 transition-colors active:scale-95 disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={openCameraPicker}
                  disabled={isProcessing}
                  className="absolute bottom-3 right-3 px-4 py-2 rounded-full bg-white/80 backdrop-blur-md flex items-center gap-2 text-sm font-medium text-slate-700 hover:bg-white transition-colors active:scale-95 disabled:opacity-50 shadow-lg"
                >
                  <Camera className="w-4 h-4" />
                  撮り直し
                </button>
                <button
                  type="button"
                  onClick={openFilePicker}
                  disabled={isProcessing}
                  className="absolute bottom-3 left-3 px-4 py-2 rounded-full bg-white/80 backdrop-blur-md flex items-center gap-2 text-sm font-medium text-slate-700 hover:bg-white transition-colors active:scale-95 disabled:opacity-50 shadow-lg"
                >
                  <ImageIcon className="w-4 h-4" />
                  ファイル
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={openCameraPicker}
                disabled={isProcessing}
                className="w-full aspect-[4/3] flex flex-col items-center justify-center gap-4 group transition-all duration-300 hover:bg-slate-50/50 active:scale-[0.98] disabled:opacity-50"
              >
                <div className="w-20 h-20 rounded-full bg-[#007AFF]/10 flex items-center justify-center group-hover:bg-[#007AFF]/15 transition-colors">
                  <Camera className="w-10 h-10 text-[#007AFF] stroke-[1.5]" />
                </div>
                <div className="text-center">
                  <p className="text-base font-semibold text-slate-800">
                    カメラで撮影
                  </p>
                  <p className="text-sm text-slate-500 mt-1">
                    タップするとカメラが起動します
                  </p>
                </div>
              </button>
            )}
          </div>
          {!previewUrl && (
            <div className="px-4 pb-4 pt-0">
              <button
                type="button"
                onClick={openFilePicker}
                disabled={isProcessing}
                className="w-full h-11 rounded-full bg-slate-100 text-slate-700 font-medium text-sm flex items-center justify-center gap-2 hover:bg-slate-200 transition-colors active:scale-[0.98] disabled:opacity-50"
              >
                <ImageIcon className="w-4 h-4" />
                ファイルから画像を選択
              </button>
            </div>
          )}

          {imageFile && !processedUrl && (
            <div className="p-4 pt-0 flex flex-col gap-3">
              <button
                type="button"
                onClick={processImage}
                disabled={isProcessing}
                className="relative w-full h-14 rounded-full overflow-hidden bg-[#007AFF] text-base font-semibold text-white shadow-[0_4px_14px_rgb(0,122,255,0.25)] transition-all duration-200 hover:bg-[#0066DD] active:scale-[0.96] disabled:opacity-70 disabled:active:scale-100 flex items-center justify-center gap-2"
              >
                {!isProcessing && (
                  <div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                    style={{ animation: "scanning 2s ease-in-out infinite" }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {statusMessage || "処理中..."}
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

          {error && (
            <div className="mx-4 mb-4 rounded-2xl bg-[#FF3B30]/10 border border-[#FF3B30]/20 p-4">
              <p className="text-sm font-medium text-[#FF3B30]">{error}</p>
            </div>
          )}
        </section>

        <AdBanner slot="main-page-middle" position="middle" enabled={false} />

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
