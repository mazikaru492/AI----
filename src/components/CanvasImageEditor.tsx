'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { Download, RefreshCw, Wand2, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { extractNumbersFromImage, type DetectedNumber } from '@/lib/ocr';
import {
  replaceNumbersOnCanvas,
  drawImageToCanvas,
  canvasToBlob,
  scaleBbox,
  type NumberReplacement,
} from '@/lib/canvasUtils';
import { generateRandomReplacements } from '@/lib/numberGenerator';

interface CanvasImageEditorProps {
  imageFile: File;
  onGenerateReplacements?: (numbers: string[]) => Promise<{ original: string; replacement: string }[]>;
  onComplete?: () => void;
}

type EditorState =
  | 'idle'
  | 'loading-ocr'
  | 'ocr-complete'
  | 'generating'
  | 'verifying'
  | 'complete'
  | 'error';

interface VerificationResult {
  problems: Array<{
    id: number;
    expression: string;
    isSolvable: boolean;
    issue: string | null;
  }>;
  allValid: boolean;
}

const MAX_RETRY_ATTEMPTS = 3;

/**
 * Canvas画像エディタ with AI検証ループ
 * 画像内の数値を検出し、ランダム数値で置換、AIで検証
 */
export function CanvasImageEditor({
  imageFile,
  onComplete,
}: CanvasImageEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalImageRef = useRef<HTMLImageElement | null>(null);
  const scaleRef = useRef<number>(1);

  const [state, setState] = useState<EditorState>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [detectedNumbers, setDetectedNumbers] = useState<DetectedNumber[]>([]);
  const [replacements, setReplacements] = useState<NumberReplacement[]>([]);
  const [verificationStatus, setVerificationStatus] = useState<string>('');
  const [retryCount, setRetryCount] = useState(0);

  // 画像をCanvasに読み込み
  const loadImage = useCallback(async () => {
    if (!canvasRef.current) return;

    const img = new Image();
    img.src = URL.createObjectURL(imageFile);

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
    });

    originalImageRef.current = img;
    const { scale } = drawImageToCanvas(canvasRef.current, img, 600);
    scaleRef.current = scale;
  }, [imageFile]);

  // OCRを実行
  const runOCR = useCallback(async () => {
    setState('loading-ocr');
    setProgress(0);
    setError(null);

    try {
      await loadImage();

      const result = await extractNumbersFromImage(imageFile, (p) => {
        setProgress(p);
      });

      if (result.numbers.length === 0) {
        throw new Error('数値が検出されませんでした');
      }

      setDetectedNumbers(result.numbers);
      setState('ocr-complete');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'OCRエラー');
      setState('error');
    }
  }, [imageFile, loadImage]);

  // Canvasに数値を描画
  const drawReplacementsOnCanvas = useCallback((replacementsWithBbox: NumberReplacement[]) => {
    if (canvasRef.current && originalImageRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        drawImageToCanvas(canvasRef.current, originalImageRef.current, 600);
        replaceNumbersOnCanvas(ctx, replacementsWithBbox);
      }
    }
  }, []);

  // CanvasをBase64に変換
  const canvasToBase64 = useCallback((): string => {
    if (!canvasRef.current) return '';
    const dataUrl = canvasRef.current.toDataURL('image/png');
    return dataUrl.replace(/^data:image\/\w+;base64,/, '');
  }, []);

  // AI検証を実行
  const verifyWithAI = useCallback(async (): Promise<VerificationResult> => {
    const base64 = canvasToBase64();

    const res = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: base64,
        mimeType: 'image/png'
      }),
    });

    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      throw new Error(data.error || 'AI検証に失敗しました');
    }

    return res.json();
  }, [canvasToBase64]);

  // 類題を生成（ランダム + AI検証ループ）
  const generateWithVerification = useCallback(async () => {
    if (detectedNumbers.length === 0) return;

    setState('generating');
    setError(null);
    setRetryCount(0);

    try {
      const uniqueNumbers = [...new Set(detectedNumbers.map((n) => n.text))];

      let attempts = 0;
      let isValid = false;
      let currentReplacements: NumberReplacement[] = [];

      while (!isValid && attempts < MAX_RETRY_ATTEMPTS) {
        attempts++;
        setRetryCount(attempts);
        setVerificationStatus(`試行 ${attempts}/${MAX_RETRY_ATTEMPTS}: 数値を生成中...`);

        // ランダム数値を生成
        const randomReplacements = generateRandomReplacements(uniqueNumbers);

        // 座標と置換数値を紐付け
        currentReplacements = detectedNumbers.map((detected) => {
          const match = randomReplacements.find((r) => r.original === detected.text);
          return {
            original: detected.text,
            replacement: match?.replacement || detected.text,
            bbox: scaleBbox(detected.bbox, scaleRef.current),
          };
        });

        // Canvasに描画
        drawReplacementsOnCanvas(currentReplacements);

        // AI検証
        setState('verifying');
        setVerificationStatus(`試行 ${attempts}/${MAX_RETRY_ATTEMPTS}: AIが検証中...`);

        try {
          const verification = await verifyWithAI();
          console.log('[Verification Result]', verification);

          if (verification.allValid) {
            isValid = true;
            setVerificationStatus('✅ 全ての問題が解けることを確認しました');
          } else {
            const issues = verification.problems
              .filter((p) => !p.isSolvable)
              .map((p) => p.issue)
              .join(', ');
            console.log('[Verification Issues]', issues);
            setVerificationStatus(`⚠️ 問題を再生成中: ${issues}`);
            setState('generating');
          }
        } catch (verifyError) {
          console.warn('[Verification Error]', verifyError);
          isValid = true;
          setVerificationStatus('⚠️ 検証をスキップしました');
        }
      }

      setReplacements(currentReplacements);
      setState('complete');
      onComplete?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成エラー');
      setState('error');
    }
  }, [detectedNumbers, drawReplacementsOnCanvas, verifyWithAI, onComplete]);

  // 画像をダウンロード
  const downloadImage = useCallback(async () => {
    if (!canvasRef.current) return;

    try {
      const blob = await canvasToBlob(canvasRef.current, 'image/png');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `edited_${imageFile.name.replace(/\.[^/.]+$/, '')}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError('ダウンロードに失敗しました');
    }
  }, [imageFile.name]);

  // リセット
  const reset = useCallback(async () => {
    if (canvasRef.current && originalImageRef.current) {
      drawImageToCanvas(canvasRef.current, originalImageRef.current, 600);
    }
    setReplacements([]);
    setVerificationStatus('');
    setRetryCount(0);
    setState('ocr-complete');
  }, []);

  // 初回ロード時にOCRを実行
  useEffect(() => {
    runOCR();
  }, [runOCR]);

  return (
    <div className="space-y-4">
      {/* Canvas */}
      <div className="relative overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5">
        <canvas
          ref={canvasRef}
          className="mx-auto block max-w-full"
          style={{ minHeight: '200px' }}
        />

        {/* Loading overlay */}
        {(state === 'loading-ocr' || state === 'generating' || state === 'verifying') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="mt-2 text-sm text-zinc-600">
              {state === 'loading-ocr'
                ? `OCR処理中... ${progress}%`
                : state === 'verifying'
                  ? 'AI検証中...'
                  : '類題を生成中...'}
            </p>
            {verificationStatus && (
              <p className="mt-1 text-xs text-zinc-500">{verificationStatus}</p>
            )}
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Detected numbers info */}
      {state === 'ocr-complete' && (
        <div className="rounded-lg bg-blue-50 p-3">
          <p className="text-sm font-medium text-blue-900">
            {detectedNumbers.length}個の数値を検出しました
          </p>
          <p className="mt-1 text-xs text-blue-700">
            検出: {[...new Set(detectedNumbers.map((n) => n.text))].join(', ')}
          </p>
        </div>
      )}

      {/* Verification status */}
      {state === 'complete' && verificationStatus && (
        <div className="flex items-start gap-2 rounded-lg bg-green-50 p-3">
          <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-green-600" />
          <span className="text-sm text-green-700">{verificationStatus}</span>
        </div>
      )}

      {/* Replacements info */}
      {state === 'complete' && replacements.length > 0 && (
        <div className="rounded-lg bg-zinc-50 p-3">
          <p className="text-sm font-medium text-zinc-900">
            数値を置換しました
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[...new Map(replacements.map((r) => [r.original, r])).values()].map(
              (r, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-xs ring-1 ring-zinc-200"
                >
                  <span className="text-zinc-500">{r.original}</span>
                  <span className="text-zinc-400">→</span>
                  <span className="font-medium text-blue-700">
                    {r.replacement}
                  </span>
                </span>
              )
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {state === 'ocr-complete' && (
          <button
            type="button"
            onClick={generateWithVerification}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Wand2 className="h-4 w-4" />
            類題を生成（AI検証付き）
          </button>
        )}

        {state === 'complete' && (
          <>
            <button
              type="button"
              onClick={reset}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-200"
            >
              <RefreshCw className="h-4 w-4" />
              やり直す
            </button>
            <button
              type="button"
              onClick={downloadImage}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700"
            >
              <Download className="h-4 w-4" />
              保存
            </button>
          </>
        )}

        {state === 'error' && (
          <button
            type="button"
            onClick={runOCR}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-200"
          >
            <RefreshCw className="h-4 w-4" />
            再試行
          </button>
        )}
      </div>
    </div>
  );
}
