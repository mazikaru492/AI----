'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { Download, RefreshCw, Wand2, Loader2, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';
import Tesseract from 'tesseract.js';
import {
  replaceNumbersOnCanvas,
  drawImageToCanvas,
  canvasToBlob,
  type NumberReplacement,
  type BoundingBox,
} from '@/lib/canvasUtils';
import { generateUniqueRandomReplacements } from '@/lib/numberGenerator';

interface CanvasImageEditorProps {
  imageFile: File;
  onComplete?: () => void;
}

type EditorState =
  | 'idle'
  | 'loading-detect'
  | 'detect-complete'
  | 'generating'
  | 'verifying'
  | 'complete'
  | 'error';

/**
 * 検出数値情報
 * bbox: ピクセル座標 (x, y, width, height)
 */
interface DetectedNumber {
  text: string;
  bbox: BoundingBox;
}

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
 * Canvas画像エディタ with Tesseract.js クライアントサイドOCR + AI検証ループ
 */
export function CanvasImageEditor({
  imageFile,
  onComplete,
}: CanvasImageEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalImageRef = useRef<HTMLImageElement | null>(null);
  const scaleRef = useRef<number>(1);
  const imageDimensionsRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  const [state, setState] = useState<EditorState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [detectedNumbers, setDetectedNumbers] = useState<DetectedNumber[]>([]);
  const [replacements, setReplacements] = useState<NumberReplacement[]>([]);
  const [verificationStatus, setVerificationStatus] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [ocrProgress, setOcrProgress] = useState<number>(0);

  // 画像をCanvasに読み込み
  const loadImage = useCallback(async (): Promise<{ width: number; height: number }> => {
    if (!canvasRef.current) throw new Error('Canvas not ready');

    const img = new Image();
    img.src = URL.createObjectURL(imageFile);

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
    });

    originalImageRef.current = img;
    imageDimensionsRef.current = { width: img.naturalWidth, height: img.naturalHeight };
    const { scale } = drawImageToCanvas(canvasRef.current, img, 600);
    scaleRef.current = scale;

    return { width: img.naturalWidth, height: img.naturalHeight };
  }, [imageFile]);

  /**
   * Tesseract.js でクライアントサイドOCRを実行
   * 数値（0-9）のみをフィルタリングして抽出
   */
  const detectWithTesseract = useCallback(async () => {
    setState('loading-detect');
    setError(null);
    setStatusMessage('Tesseract OCRで数値を検出中...');
    setOcrProgress(0);

    try {
      await loadImage();

      if (!canvasRef.current) throw new Error('Canvas not ready');

      console.log('[OCR] Starting Tesseract recognition...');

      // Tesseract.js v5+ API: createWorkerを使用
      const worker = await Tesseract.createWorker('eng', undefined, {
        logger: (m) => {
          console.log('[OCR] Status:', m.status, m.progress);
          if (m.status === 'recognizing text') {
            setOcrProgress(Math.round(m.progress * 100));
            setStatusMessage(`認識中... ${Math.round(m.progress * 100)}%`);
          } else if (m.status === 'loading language traineddata') {
            setStatusMessage('言語データをロード中...');
          }
        },
      });

      // ホワイトリストは削除: シンボルレベルでフィルタリングするため
      // 日本語や変数（x, y）も認識し、数字のみをシンボルレベルで抽出

      // blocks: true で単語レベルのbbox情報を取得
      const result = await worker.recognize(canvasRef.current, {}, { blocks: true });

      // ワーカーを終了
      await worker.terminate();

      console.log('[OCR] Recognition complete');
      console.log('[OCR] Full text:', result.data.text);

      // 検出された単語から数値のみを抽出
      const numbers: DetectedNumber[] = [];

      // Tesseract.js v7 の結果構造を安全にアクセス
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = result.data as any;



      // words配列から抽出（まずフラットなwords配列を試す）
      let words: Array<{ text: string; bbox?: { x0: number; y0: number; x1: number; y1: number } }> = [];

      if (data.words && Array.isArray(data.words) && data.words.length > 0) {
        words = data.words;
        console.log('[OCR] Using flat words array:', words.length, 'words');
      } else if (data.blocks && Array.isArray(data.blocks)) {
        // blocks -> paragraphs -> lines -> words の階層構造から取得
        console.log('[OCR] Using blocks structure...');
        for (const block of data.blocks) {
          if (block.paragraphs) {
            for (const paragraph of block.paragraphs) {
              if (paragraph.lines) {
                for (const line of paragraph.lines) {
                  if (line.words) {
                    words.push(...line.words);
                  }
                }
              }
            }
          }
        }
        console.log('[OCR] Extracted', words.length, 'words from blocks');
      } else if (data.paragraphs) {
        // paragraphs -> lines -> words の階層構造から取得
        console.log('[OCR] Using paragraphs structure...');
        for (const paragraph of data.paragraphs) {
          if (paragraph.lines) {
            for (const line of paragraph.lines) {
              if (line.words) {
                words.push(...line.words);
              }
            }
          }
        }
        console.log('[OCR] Extracted', words.length, 'words from paragraphs');
      }

      // シンボルレベルで数値を抽出（Pixel-Perfect In-Place Replacement）
      const MIN_CONFIDENCE = 70; // 最小信頼度 70%

      for (const word of words) {
        const wordText = word.text || '';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wordConfidence = (word as any).confidence || 0;

        console.log('[OCR] Word found:', wordText, 'bbox:', word.bbox, 'confidence:', wordConfidence);

        // 信頼度チェック: 低信頼度の検出はスキップ
        if (wordConfidence < MIN_CONFIDENCE) {
          console.log('[OCR] Skipping low confidence word:', wordText, `(${wordConfidence}%)`);
          continue;
        }

        // シンボルレベル処理: word.symbols[] 配列を使用
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const symbols = (word as any).symbols || [];

        if (symbols.length === 0) {
          // フォールバック: symbolsがない場合は従来のword-levelロジック
          if (/^\d+$/.test(wordText) && word.bbox) {
            const { x0, y0, x1, y1 } = word.bbox;
            numbers.push({
              text: wordText,
              bbox: {
                x: x0,
                y: y0,
                width: x1 - x0,
                height: y1 - y0,
              },
            });
            console.log('[OCR] Number detected (word-level fallback):', wordText, 'at', { x0, y0, x1, y1 }, `confidence: ${wordConfidence}%`);
          }
        } else {
          // シンボルレベルで個別に処理（"2x" → "2" と "x" を分離）
          for (const symbol of symbols) {
            const symbolText = symbol.text || '';
            const symbolConfidence = symbol.confidence || 0;

            console.log('[OCR]   Symbol:', symbolText, 'bbox:', symbol.bbox, 'confidence:', symbolConfidence);

            // 厳格な数字チェック: 単一の数字のみ（0-9）
            if (/^[0-9]$/.test(symbolText) && symbol.bbox && symbolConfidence >= MIN_CONFIDENCE) {
              const { x0, y0, x1, y1 } = symbol.bbox;
              numbers.push({
                text: symbolText,
                bbox: {
                  x: x0,
                  y: y0,
                  width: x1 - x0,
                  height: y1 - y0,
                },
              });
              console.log('[OCR]   ✓ Number symbol detected:', symbolText, 'at', { x0, y0, x1, y1 }, `confidence: ${symbolConfidence}%`);
            } else if (symbolText && !(/^[0-9]$/.test(symbolText))) {
              console.log('[OCR]   ✗ Non-numeric symbol ignored:', symbolText);
            }
          }
        }
      }

      // フォールバック：全文テキストから数値を抽出（座標は推定）
      if (numbers.length === 0 && data.text) {
        console.log('[OCR] Fallback: extracting numbers from full text...');
        const fullTextMatches = data.text.match(/\d+/g);
        if (fullTextMatches) {
          console.log('[OCR] Found', fullTextMatches.length, 'numbers in full text (no coordinates)');
          // 座標がないため、ユーザーに警告
        }
      }

      if (numbers.length === 0) {
        throw new Error('数値が検出されませんでした。画像を確認してください。');
      }

      console.log('[OCR] Total numbers found:', numbers.length);
      setDetectedNumbers(numbers);
      setState('detect-complete');
      setStatusMessage('');
      setOcrProgress(100);
    } catch (e) {
      console.error('[OCR] Error:', e);
      setError(e instanceof Error ? e.message : 'OCR検出エラー');
      setState('error');
      setStatusMessage('');
    }
  }, [loadImage]);

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
        mimeType: 'image/png',
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

    try {
      // 各検出を独立して処理（グループ化なし - ユニーク乱数生成）
      const allTexts = detectedNumbers.map((n) => n.text);

      let attempts = 0;
      let isValid = false;
      let currentReplacements: NumberReplacement[] = [];

      while (!isValid && attempts < MAX_RETRY_ATTEMPTS) {
        attempts++;
        setVerificationStatus(`試行 ${attempts}/${MAX_RETRY_ATTEMPTS}: 数値を生成中...`);

        // 各バウンディングボックスごとに独立したユニーク乱数を生成
        const randomReplacements = generateUniqueRandomReplacements(allTexts);

        // ピクセル座標と置換数値を紐付け（インデックスベースで1:1対応）
        currentReplacements = detectedNumbers.map((detected, index) => ({
          original: detected.text,
          replacement: randomReplacements[index]?.replacement || detected.text,
          bbox: detected.bbox,
        }));

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
    setState('detect-complete');
  }, []);

  // 初回ロード時にTesseract OCRを実行
  useEffect(() => {
    detectWithTesseract();
  }, [detectWithTesseract]);

  return (
    <div className="space-y-4">
      {/* Canvas */}
      <div className="relative overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5">
        <canvas
          ref={canvasRef}
          className="mx-auto block max-w-full"
          style={{ minHeight: '200px' }}
        />

        {/* Loading overlay with scanning animation */}
        {(state === 'loading-detect' || state === 'generating' || state === 'verifying') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm overflow-hidden">
            {/* Scanning light bar */}
            <div
              className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-[#007AFF] to-transparent opacity-80"
              style={{
                animation: 'scanning 1.5s ease-in-out infinite',
              }}
            />
            <Loader2 className="h-8 w-8 animate-spin text-[#007AFF]" />
            <p className="mt-2 text-sm text-slate-700 font-medium">
              {state === 'loading-detect'
                ? 'Tesseract OCRで数値を検出中...'
                : state === 'verifying'
                  ? 'AI検証中...'
                  : '類題を生成中...'}
            </p>
            {(statusMessage || verificationStatus) && (
              <p className="mt-1 text-xs text-slate-500">{statusMessage || verificationStatus}</p>
            )}

            {/* OCR Progress Bar */}
            {state === 'loading-detect' && ocrProgress > 0 && (
              <div className="mt-3 w-48">
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#007AFF] transition-all duration-300 ease-out"
                    style={{ width: `${ocrProgress}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-center text-slate-500">{ocrProgress}%</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scanning animation keyframes */}
      <style jsx>{`
        @keyframes scanning {
          0%, 100% {
            top: 0%;
          }
          50% {
            top: 100%;
          }
        }
      `}</style>

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Detected numbers info */}
      {state === 'detect-complete' && (
        <div className="rounded-lg bg-blue-50 p-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-600" />
            <p className="text-sm font-medium text-blue-900">
              Tesseract OCRで {detectedNumbers.length}個の数値を検出しました
            </p>
          </div>
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
        {state === 'detect-complete' && (
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
            onClick={detectWithTesseract}
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
