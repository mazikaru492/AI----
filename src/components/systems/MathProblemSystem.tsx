"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Download,
  FileText,
  HelpCircle,
  ImageIcon,
  Loader2,
  Pencil,
  RefreshCw,
  Sparkles,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { pdf } from "@react-pdf/renderer";
import { useAppShell } from "@/components/AppShell";
import { AdBanner } from "@/components/ads/AdBanner";
import {
  smartEraseAndReplace,
  canvasToBlob,
  type DetectedNumber,
} from "@/lib/smartErase";
import { compressImage, MAX_IMAGE_UPLOAD_BYTES } from "@/lib/imageCompression";
import {
  requestAiTransformation,
  generateDeterministicTransformations,
  type MathSolutionDetail,
  type ReplacementMapping,
} from "@/lib/mathTransformEngine";
import { MathProblemPdfDocument } from "@/components/ProblemPdf";

interface DetectionResponse {
  numbers: DetectedNumber[];
  rawText?: string;
  tokens?: unknown[];
  success: boolean;
  error?: string;
}

interface MathProblemSystemProps {
  onBack: () => void;
}

const MAX_BASE64_SAFE_FILE_BYTES = Math.floor(MAX_IMAGE_UPLOAD_BYTES * 0.72);
const SCALE_FACTOR = 2;

export function MathProblemSystem({ onBack }: MathProblemSystemProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalImageRef = useRef<HTMLImageElement | null>(null);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  // 数理認識＆置換データ
  const [detectedNumbers, setDetectedNumbers] = useState<DetectedNumber[]>([]);
  const [scaledNumbers, setScaledNumbers] = useState<DetectedNumber[]>([]);
  const [rawOcrText, setRawOcrText] = useState<string>("");
  const [replacementList, setReplacementList] = useState<ReplacementMapping[]>([]);
  const [solutionDetail, setSolutionDetail] = useState<MathSolutionDetail | null>(null);
  const [showSteps, setShowSteps] = useState(true);
  const [activeTab, setActiveTab] = useState<"preview" | "solution">("preview");

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
      setDetectedNumbers([]);
      setScaledNumbers([]);
      setReplacementList([]);
      setSolutionDetail(null);
    },
    []
  );

  const clearFile = useCallback(() => {
    setImageFile(null);
    setProcessedUrl(null);
    setError(null);
    setDetectedNumbers([]);
    setScaledNumbers([]);
    setReplacementList([]);
    setSolutionDetail(null);
    originalImageRef.current = null;
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const openCameraPicker = useCallback(() => {
    cameraInputRef.current?.click();
  }, []);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /**
   * 指定した置換マッピングを用いて Canvas を再描画・合成する
   */
  const renderCanvasWithReplacements = useCallback(
    async (
      customReplacements: Map<string, string> | string[],
      currentScaledNumbers: DetectedNumber[]
    ) => {
      if (!canvasRef.current || !originalImageRef.current) return;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const img = originalImageRef.current;
      const originalWidth = img.naturalWidth || img.width;
      const originalHeight = img.naturalHeight || img.height;

      canvas.width = originalWidth * SCALE_FACTOR;
      canvas.height = originalHeight * SCALE_FACTOR;

      ctx.save();
      ctx.scale(SCALE_FACTOR, SCALE_FACTOR);
      ctx.drawImage(img, 0, 0);
      ctx.restore();

      smartEraseAndReplace(ctx, currentScaledNumbers, {
        padding: 2 * SCALE_FACTOR,
        minBrightness: 200,
        minFontSize: 10 * SCALE_FACTOR,
        smallBoxThreshold: 20 * SCALE_FACTOR,
        customReplacements,
      });

      const blob = await canvasToBlob(canvas);
      const resultUrl = URL.createObjectURL(blob);
      setProcessedUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return resultUrl;
      });
    },
    []
  );

  /**
   * メイン処理: 画像解析 -> 数理整合置換 -> 解答・解説生成 -> Canvas描画
   */
  const processImage = useCallback(async () => {
    if (!imageFile || !canvasRef.current) return;

    setIsProcessing(true);
    setError(null);
    setProcessedUrl(null);

    try {
      setStatusMessage("画像を読み込み中...");
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
        img.src = URL.createObjectURL(imageFile);
      });
      originalImageRef.current = img;

      const originalWidth = img.width;
      const originalHeight = img.height;

      setStatusMessage("数式と数字を検出中 (GLM-OCR)...");
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
        const message = data?.error || `検出エラー (${response.status})`;
        throw new Error(message);
      }
      if (!data || !data.numbers || data.numbers.length === 0) {
        throw new Error(
          "数字が検出されませんでした。数字を含む教科書・問題集の画像をお試しください。"
        );
      }

      const rawNumbers = data.numbers;
      const recognizedText = data.rawText || "";
      setDetectedNumbers(rawNumbers);
      setRawOcrText(recognizedText);

      // スケール計算
      const toOriginalScaleX = originalWidth / detectionImg.width;
      const toOriginalScaleY = originalHeight / detectionImg.height;
      const currentScaledNumbers: DetectedNumber[] = rawNumbers.map((n) => ({
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
      setScaledNumbers(currentScaledNumbers);

      setStatusMessage("数理整合性を計算＆類題・解説を生成中...");
      const transformResult = await requestAiTransformation({
        numbers: rawNumbers.map((n) => n.text),
        rawText: recognizedText,
        detections: rawNumbers,
      });

      setReplacementList(transformResult.replacements);
      setSolutionDetail(transformResult.solution);

      setStatusMessage("画像を合成中...");
      const customArray = transformResult.replacements.map((r) => r.replacement);
      await renderCanvasWithReplacements(customArray, currentScaledNumbers);

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
        summary: `数学類題: ${transformResult.solution.problemType || "問題変換"} (${rawNumbers.length}箇所置換)`,
        numbersDetected: rawNumbers.length,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラーが発生しました");
    } finally {
      setIsProcessing(false);
      setStatusMessage("");
    }
  }, [
    imageFile,
    incrementApiUsage,
    addHistoryEntry,
    renderCanvasWithReplacements,
  ]);

  /**
   * 別の数値パターンで再シャッフル
   */
  const handleShuffle = useCallback(async () => {
    if (detectedNumbers.length === 0 || scaledNumbers.length === 0) return;

    setIsRegenerating(true);
    try {
      const transformResult = generateDeterministicTransformations(
        detectedNumbers,
        rawOcrText
      );

      setReplacementList(transformResult.replacements);
      setSolutionDetail(transformResult.solution);

      const customArray = transformResult.replacements.map((r) => r.replacement);
      await renderCanvasWithReplacements(customArray, scaledNumbers);
    } catch (err) {
      console.error("[handleShuffle] Error:", err);
    } finally {
      setIsRegenerating(false);
    }
  }, [
    detectedNumbers,
    scaledNumbers,
    rawOcrText,
    renderCanvasWithReplacements,
  ]);

  /**
   * 特定の数値を手動で変更（インデックス指定で個別に更新）
   */
  const handleCustomNumberChange = useCallback(
    async (index: number, newReplacement: string) => {
      const updatedList = replacementList.map((item, idx) =>
        idx === index ? { ...item, replacement: newReplacement } : item
      );
      setReplacementList(updatedList);

      const customArray = updatedList.map((r) => r.replacement);
      await renderCanvasWithReplacements(customArray, scaledNumbers);
    },
    [replacementList, scaledNumbers, renderCanvasWithReplacements]
  );

  /**
   * 画像ダウンロード (PNG)
   */
  const handleDownloadImage = useCallback(() => {
    if (!processedUrl) return;
    const a = document.createElement("a");
    a.href = processedUrl;
    a.download = `math-problem-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [processedUrl]);

  /**
   * 印刷用 PDF 出力 (問題＋解答・ステップ解説)
   */
  const handleDownloadPdf = useCallback(async () => {
    if (!processedUrl && !solutionDetail) return;
    setIsGeneratingPdf(true);
    try {
      const doc = (
        <MathProblemPdfDocument
          imageUrl={processedUrl ?? undefined}
          solution={solutionDetail ?? undefined}
          createdAt={new Date().toLocaleString("ja-JP")}
        />
      );
      const blob = await pdf(doc).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `math-sheet-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[handleDownloadPdf] Error:", err);
      alert("PDFの生成に失敗しました。");
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [processedUrl, solutionDetail]);

  const usageStatusColor = useMemo(
    () => (apiUsageCount < apiUsageLimit * 0.8 ? "#34c759" : "#ff9500"),
    [apiUsageCount, apiUsageLimit]
  );

  return (
    <>
      <div className="liquid-page-bg" />

      {/* 描画用隠しCanvas */}
      <canvas ref={canvasRef} className="hidden" />

      <main className="mx-auto w-full max-w-xl md:max-w-6xl px-4 md:px-8 py-4 md:py-8">
        <div className="flex flex-col gap-4 md:gap-6">
          {/* 上部ヘッダー */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onBack}
              className="liquid-button inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm md:text-base font-medium"
            >
              <ArrowLeft className="h-4 w-4 md:h-5 md:w-5" />
              システム選択に戻る
            </button>
            <div className="liquid-chip flex items-center gap-2 rounded-full px-4 py-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: usageStatusColor }}
              />
              <span className="font-mono text-sm md:text-base font-medium text-white">
                利用回数: {apiUsageCount}/{apiUsageLimit}
              </span>
            </div>
          </div>

          <div className="text-center md:text-left">
            <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-white drop-shadow-sm flex items-center gap-2 justify-center md:justify-start">
              <Sparkles className="w-6 h-6 md:w-8 md:h-8 text-amber-300" />
              AI 数学類題変換＆解説作成
            </h1>
            <p className="mt-1.5 text-sm md:text-base text-white/85">
              問題用紙を撮影すると、数理整合性を保ったまま数値だけを変え、模範解答・途中式を自動作成します
            </p>
          </div>

          {/* 隠しインプット */}
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

          {/* メインレイアウト */}
          <div className="grid gap-4 md:gap-6 md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            {/* 左パネル: 入力 & プレビュー */}
            <section className="liquid-panel overflow-hidden rounded-[24px] md:rounded-[32px] flex flex-col justify-between">
              <div className="relative">
                {previewUrl ? (
                  <>
                    <div
                      className="relative aspect-[4/3] flex items-center justify-center"
                      style={{ background: "rgba(255, 255, 255, 0.08)" }}
                    >
                      <img
                        src={previewUrl}
                        alt="元画像プレビュー"
                        className="w-full h-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={clearFile}
                        disabled={isProcessing}
                        aria-label="画像をクリア"
                        className="liquid-button absolute right-2 top-2 md:right-3 md:top-3 flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-full transition-colors active:scale-95 disabled:opacity-50"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="flex gap-2 px-3 pt-3 md:px-4 md:pt-4">
                      <button
                        type="button"
                        onClick={openCameraPicker}
                        disabled={isProcessing}
                        className="liquid-button flex flex-1 items-center justify-center gap-1.5 md:gap-2 rounded-full px-3 md:px-4 py-2 md:py-2.5 text-xs md:text-sm font-medium active:scale-95 disabled:opacity-50"
                      >
                        <Camera className="w-4 h-4" />
                        撮り直し
                      </button>
                      <button
                        type="button"
                        onClick={openFilePicker}
                        disabled={isProcessing}
                        className="liquid-button flex flex-1 items-center justify-center gap-1.5 md:gap-2 rounded-full px-3 md:px-4 py-2 md:py-2.5 text-xs md:text-sm font-medium active:scale-95 disabled:opacity-50"
                      >
                        <ImageIcon className="w-4 h-4" />
                        画像を選択
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={openCameraPicker}
                    disabled={isProcessing}
                    className="flex w-full aspect-[4/3] flex-col items-center justify-center gap-5 transition-all duration-300 hover:bg-white/5 active:scale-[0.98] disabled:opacity-50"
                  >
                    <div className="flex h-20 w-20 md:h-24 md:w-24 items-center justify-center rounded-full bg-white/25 transition-colors backdrop-blur-sm shadow-inner">
                      <Camera className="w-10 h-10 md:w-12 md:h-12 text-white stroke-[1.5]" />
                    </div>
                    <div className="text-center">
                      <p className="text-base md:text-lg font-semibold text-white drop-shadow-sm">
                        カメラで問題用紙を撮影
                      </p>
                      <p className="text-sm md:text-base mt-1 text-white/70">
                        タップして撮影を開始します
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
                    className="liquid-button flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm md:text-base font-medium transition-colors active:scale-[0.98] disabled:opacity-50"
                  >
                    <ImageIcon className="w-4 h-4" />
                    ファイルから画像を選択
                  </button>
                </div>
              )}

              {imageFile && !processedUrl && (
                <div className="p-4 pt-3 flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={processImage}
                    disabled={isProcessing}
                    className="liquid-button-primary relative flex h-13 md:h-14 w-full items-center justify-center gap-2 overflow-hidden rounded-full text-base md:text-lg font-semibold transition-all duration-200 active:scale-[0.96] disabled:opacity-70"
                  >
                    {!isProcessing && (
                      <div
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent"
                        style={{ animation: "scanning 2s ease-in-out infinite" }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2">
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          {statusMessage || "AI解析＆類題生成中..."}
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-5 h-5" />
                          数値を変えて類題を生成
                        </>
                      )}
                    </span>
                  </button>
                </div>
              )}

              {error && (
                <div
                  className="liquid-panel-soft mx-3 md:mx-4 mb-3 md:mb-4 rounded-xl md:rounded-2xl p-3 md:p-4 border border-red-400/40 bg-red-950/40"
                >
                  <p className="text-sm font-medium text-red-200">{error}</p>
                </div>
              )}
            </section>

            {/* 右パネル: 結果表示 / 微調整 / 解答解説 */}
            <div className="flex flex-col gap-4">
              {processedUrl ? (
                <section className="liquid-panel animate-fadeIn overflow-hidden rounded-[24px] md:rounded-[32px] flex flex-col gap-4 p-4 md:p-5">
                  {/* ヘッダー */}
                  <div className="flex items-center justify-between">
                    <h2 className="flex items-center gap-2 text-lg md:text-xl font-bold text-white drop-shadow-sm">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/30 text-emerald-300">
                        <CheckCircle2 className="h-5 w-5" />
                      </span>
                      類題生成完了
                    </h2>

                    {/* タブ切り替え */}
                    <div className="flex rounded-full bg-white/10 p-1">
                      <button
                        type="button"
                        onClick={() => setActiveTab("preview")}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                          activeTab === "preview"
                            ? "bg-white text-gray-900 shadow-sm"
                            : "text-white/70 hover:text-white"
                        }`}
                      >
                        画像
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("solution")}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                          activeTab === "solution"
                            ? "bg-white text-gray-900 shadow-sm"
                            : "text-white/70 hover:text-white"
                        }`}
                      >
                        解答・解説
                      </button>
                    </div>
                  </div>

                  {/* タブ 1: 画像プレビュー */}
                  {activeTab === "preview" && (
                    <div className="flex flex-col gap-3">
                      <div
                        className="overflow-hidden rounded-2xl border border-white/10"
                        style={{ background: "rgba(255, 255, 255, 0.08)" }}
                      >
                        <img
                          src={processedUrl}
                          alt="生成された類題画像"
                          className="w-full h-auto object-contain max-h-[380px]"
                        />
                      </div>

                      {/* 数値微調整チップ & 再シャッフル */}
                      {replacementList.length > 0 && (
                        <div className="rounded-2xl bg-white/10 p-3 flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-white/80 flex items-center gap-1.5">
                              <Pencil className="w-3.5 h-3.5" />
                              変換された数値 (タップして直接編集可能)
                            </span>
                            <button
                              type="button"
                              onClick={handleShuffle}
                              disabled={isRegenerating}
                              className="liquid-button inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-amber-200 active:scale-95 disabled:opacity-50"
                            >
                              <RefreshCw
                                className={`w-3 h-3 ${
                                  isRegenerating ? "animate-spin" : ""
                                }`}
                              />
                              再シャッフル
                            </button>
                          </div>

                          <div className="flex flex-wrap gap-2 pt-1">
                            {replacementList.map((item, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-1.5 rounded-lg bg-black/30 border border-white/15 px-2.5 py-1 text-xs font-mono text-white shadow-sm"
                              >
                                <span className="text-white/60 line-through">
                                  {item.original}
                                </span>
                                <span className="text-white/40">→</span>
                                <input
                                  type="text"
                                  value={item.replacement}
                                  onChange={(e) =>
                                    handleCustomNumberChange(
                                      idx,
                                      e.target.value
                                    )
                                  }
                                  className="w-10 rounded bg-white/20 px-1 py-0.5 text-center font-bold text-amber-300 focus:bg-white/30 focus:outline-none"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* タブ 2: 模範解答＆ステップ解説 */}
                  {activeTab === "solution" && (
                    <div className="flex flex-col gap-3">
                      {solutionDetail ? (
                        <div className="flex flex-col gap-3">
                          {/* 問題種別と類題数式 */}
                          <div className="rounded-2xl bg-white/10 p-4 border border-white/15">
                            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                              <span className="rounded-md bg-emerald-500/20 px-2 py-0.5">
                                {solutionDetail.problemType}
                              </span>
                            </div>
                            <div className="mt-2 text-sm md:text-base font-semibold text-white">
                              {solutionDetail.transformedFormula}
                            </div>
                            <div className="mt-3 border-t border-white/10 pt-2 flex items-center justify-between">
                              <span className="text-xs text-white/70">正答</span>
                              <span className="text-sm md:text-base font-bold text-amber-300">
                                {solutionDetail.answer}
                              </span>
                            </div>
                          </div>

                          {/* ステップ解説 */}
                          {solutionDetail.steps.length > 0 && (
                            <div className="rounded-2xl bg-white/10 p-4 border border-white/15">
                              <button
                                type="button"
                                onClick={() => setShowSteps(!showSteps)}
                                className="flex w-full items-center justify-between text-xs font-semibold text-white/80"
                              >
                                <span className="flex items-center gap-1.5">
                                  <FileText className="w-3.5 h-3.5 text-blue-300" />
                                  途中式・ステップバイステップ解説
                                </span>
                                {showSteps ? (
                                  <ChevronUp className="w-4 h-4" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </button>

                              {showSteps && (
                                <ol className="mt-3 space-y-2 text-xs md:text-sm text-white/90">
                                  {solutionDetail.steps.map((step, idx) => (
                                    <li
                                      key={idx}
                                      className="flex gap-2.5 rounded-lg bg-black/20 p-2.5 leading-relaxed"
                                    >
                                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white">
                                        {idx + 1}
                                      </span>
                                      <span>{step}</span>
                                    </li>
                                  ))}
                                </ol>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-2xl bg-white/10 p-4 text-center text-sm text-white/70">
                          解説データがありません
                        </div>
                      )}
                    </div>
                  )}

                  {/* アクションボタン */}
                  <div className="flex flex-col gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={handleDownloadImage}
                      className="liquid-button-success flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm md:text-base font-semibold active:scale-[0.98]"
                    >
                      <Download className="w-4 h-4" />
                      類題画像をダウンロード (PNG)
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadPdf}
                      disabled={isGeneratingPdf}
                      className="liquid-button flex h-11 w-full items-center justify-center gap-2 rounded-full text-xs md:text-sm font-medium active:scale-[0.98] disabled:opacity-50"
                    >
                      {isGeneratingPdf ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          PDF生成中...
                        </>
                      ) : (
                        <>
                          <FileText className="w-4 h-4 text-blue-300" />
                          問題＋模範解答・解説 PDFを印刷出力
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={clearFile}
                      className="liquid-button flex h-10 w-full items-center justify-center gap-2 rounded-full text-xs md:text-sm text-white/75 hover:text-white transition-colors"
                    >
                      別の画像で試す
                    </button>
                  </div>
                </section>
              ) : (
                /* 初期ガイド */
                <section className="liquid-panel-soft rounded-[24px] md:rounded-[28px] p-5 md:p-6 flex flex-col gap-4">
                  <h2 className="text-base md:text-lg font-bold text-white drop-shadow-sm flex items-center gap-2">
                    <HelpCircle className="w-5 h-5 text-amber-300" />
                    撮影と類題作成のポイント
                  </h2>
                  <ul className="space-y-3 text-sm text-white/85">
                    <li className="flex gap-3 items-start">
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white">
                        1
                      </span>
                      <span>
                        <strong>真上から平らに撮影</strong>:
                        影や湾曲を抑えるとOCR認識精度が大幅に向上します。
                      </span>
                    </li>
                    <li className="flex gap-3 items-start">
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white">
                        2
                      </span>
                      <span>
                        <strong>数理整合性の自動保証</strong>:
                        2次方程式や連立方程式は、解が整数・簡単な分数になるよう自動逆算されます。
                      </span>
                    </li>
                    <li className="flex gap-3 items-start">
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white">
                        3
                      </span>
                      <span>
                        <strong>解答・解説の自動作成</strong>:
                        生成後は途中式や模範解答を確認でき、PDFプリントとして印刷可能です。
                      </span>
                    </li>
                  </ul>
                  <div className="rounded-xl bg-white/10 px-4 py-2.5 text-xs text-white/75 border border-white/10">
                    💡
                    変換後は数値を直接編集したり、「再シャッフル」で別の類題パターンを試せます。
                  </div>
                </section>
              )}
            </div>
          </div>

          <AdBanner slot="main-page-middle" position="middle" enabled={false} />
        </div>
      </main>

      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.4s ease-out forwards;
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
