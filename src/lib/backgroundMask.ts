/**
 * 背景マスキング・色推定ユーティリティ
 *
 * 白塗りではなく、周辺ピクセルから背景色を推定し、
 * スキャンノイズや罫線を考慮した自然なマスクを生成する。
 *
 * 設計方針:
 * - リングサンプリングで境界部分の色を収集
 * - 中央値で代表色を決定（ノイズ耐性）
 * - 軽微なランダムノイズで「紙らしさ」を再現
 */

import type { CSSRect } from './hiDpiCanvas';

/**
 * RGB色
 */
export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

/**
 * サンプリング設定
 */
export interface SamplingOptions {
  ringWidth?: number;      // サンプリングリング幅（CSS px）
  sampleCount?: number;    // サンプリング点数
  useMedian?: boolean;     // 中央値を使用（true=ノイズ耐性向上）
}

/**
 * 中央値色を計算（各チャンネル独立）
 */
function calculateMedianColor(samples: RGBColor[]): RGBColor {
  if (samples.length === 0) {
    return { r: 255, g: 255, b: 255 };
  }

  const rs = samples.map(s => s.r).sort((a, b) => a - b);
  const gs = samples.map(s => s.g).sort((a, b) => a - b);
  const bs = samples.map(s => s.b).sort((a, b) => a - b);

  const mid = Math.floor(samples.length / 2);

  return {
    r: rs[mid],
    g: gs[mid],
    b: bs[mid],
  };
}

/**
 * 平均色を計算
 */
function calculateAverageColor(samples: RGBColor[]): RGBColor {
  if (samples.length === 0) {
    return { r: 255, g: 255, b: 255 };
  }

  const sum = samples.reduce(
    (acc, s) => ({ r: acc.r + s.r, g: acc.g + s.g, b: acc.b + s.b }),
    { r: 0, g: 0, b: 0 }
  );

  return {
    r: Math.round(sum.r / samples.length),
    g: Math.round(sum.g / samples.length),
    b: Math.round(sum.b / samples.length),
  };
}

/**
 * 矩形周囲のリング領域から背景色をサンプリング
 *
 * Morphological Dilation ロジック:
 * - bbox外周のリング領域からピクセルを取得
 * - 中央値を計算してノイズの影響を軽減
 */
export function sampleBackgroundFromRing(
  ctx: CanvasRenderingContext2D,
  rect: CSSRect,
  options: SamplingOptions = {}
): RGBColor {
  const {
    ringWidth = 3,
    sampleCount = 16,
    useMedian = true,
  } = options;

  const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
  const canvasWidth = ctx.canvas.width / dpr;
  const canvasHeight = ctx.canvas.height / dpr;

  const samples: RGBColor[] = [];

  // リング領域（bbox外周）からサンプリング
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const rx = rect.width / 2 + ringWidth;
  const ry = rect.height / 2 + ringWidth;

  for (let i = 0; i < sampleCount; i++) {
    const angle = (i / sampleCount) * Math.PI * 2;
    // dpr を考慮してピクセル位置を計算
    const sx = Math.round((cx + Math.cos(angle) * rx) * dpr);
    const sy = Math.round((cy + Math.sin(angle) * ry) * dpr);

    // 範囲内かチェック（物理ピクセル座標で）
    if (sx >= 0 && sx < ctx.canvas.width && sy >= 0 && sy < ctx.canvas.height) {
      const pixel = ctx.getImageData(sx, sy, 1, 1).data;
      samples.push({
        r: pixel[0],
        g: pixel[1],
        b: pixel[2],
      });
    }
  }

  if (samples.length === 0) {
    return { r: 255, g: 255, b: 255 }; // フォールバック: 白
  }

  return useMedian ? calculateMedianColor(samples) : calculateAverageColor(samples);
}

/**
 * マスク描画オプション
 */
export interface MaskOptions {
  noiseIntensity?: number;  // 0-1 (デフォルト: 0.02)
  padding?: number;         // 追加パディング（CSS px）
}

/**
 * スキャンノイズを模倣したマスク描画
 *
 * 推定背景色 + 軽微なランダムノイズ
 */
export function drawNoisyMask(
  ctx: CanvasRenderingContext2D,
  rect: CSSRect,
  bgColor: RGBColor,
  options: MaskOptions = {}
): void {
  const {
    noiseIntensity = 0.02,
    padding = 1,
  } = options;

  const x = rect.x - padding;
  const y = rect.y - padding;
  const w = rect.width + padding * 2;
  const h = rect.height + padding * 2;

  if (noiseIntensity <= 0) {
    // ノイズなし: 単純な矩形塗りつぶし
    ctx.fillStyle = `rgb(${bgColor.r}, ${bgColor.g}, ${bgColor.b})`;
    ctx.fillRect(x, y, w, h);
    return;
  }

  // ノイズあり: ImageDataを使用
  const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

  // 物理ピクセルサイズ
  const physX = Math.floor(x * dpr);
  const physY = Math.floor(y * dpr);
  const physW = Math.ceil(w * dpr);
  const physH = Math.ceil(h * dpr);

  if (physW <= 0 || physH <= 0) return;

  const imageData = ctx.createImageData(physW, physH);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    // ノイズ付加
    const noise = (Math.random() - 0.5) * 255 * noiseIntensity;

    data[i] = Math.min(255, Math.max(0, Math.round(bgColor.r + noise)));     // R
    data[i + 1] = Math.min(255, Math.max(0, Math.round(bgColor.g + noise))); // G
    data[i + 2] = Math.min(255, Math.max(0, Math.round(bgColor.b + noise))); // B
    data[i + 3] = 255;                                                        // A
  }

  // setTransformを一時的にリセットして物理ピクセル座標で描画
  const transform = ctx.getTransform();
  ctx.resetTransform();
  ctx.putImageData(imageData, physX, physY);
  ctx.setTransform(transform);
}

/**
 * シンプルなマスク描画（ノイズなし、高速）
 */
export function drawSimpleMask(
  ctx: CanvasRenderingContext2D,
  rect: CSSRect,
  bgColor: RGBColor,
  padding: number = 1
): void {
  ctx.fillStyle = `rgb(${bgColor.r}, ${bgColor.g}, ${bgColor.b})`;
  ctx.fillRect(
    rect.x - padding,
    rect.y - padding,
    rect.width + padding * 2,
    rect.height + padding * 2
  );
}

/**
 * 罫線検出オプション
 */
export interface GridLineOptions {
  lineThreshold?: number;   // 輝度差閾値
  lineColor?: string;       // 線の色（検出できなかった場合）
  lineWidth?: number;       // 線幅
}

/**
 * 罫線検出・補完（簡易版）
 *
 * 水平方向のエッジを検出し、線を再描画
 */
export function detectAndRestoreGridLines(
  ctx: CanvasRenderingContext2D,
  rect: CSSRect,
  options: GridLineOptions = {}
): void {
  const {
    lineThreshold = 30,
    lineWidth = 1,
  } = options;

  const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
  const canvasWidth = ctx.canvas.width / dpr;
  const canvasHeight = ctx.canvas.height / dpr;
  const checkPadding = 2;

  // 水平線を検出する関数
  const checkHorizontalLine = (y: number): RGBColor | null => {
    if (y < 0 || y >= canvasHeight) return null;

    const samples: RGBColor[] = [];
    const startX = Math.max(0, rect.x - 10);
    const endX = Math.min(canvasWidth, rect.x + rect.width + 10);

    for (let x = startX; x < endX; x += 2) {
      const physX = Math.round(x * dpr);
      const physY = Math.round(y * dpr);
      if (physX >= 0 && physX < ctx.canvas.width && physY >= 0 && physY < ctx.canvas.height) {
        const pixel = ctx.getImageData(physX, physY, 1, 1).data;
        samples.push({ r: pixel[0], g: pixel[1], b: pixel[2] });
      }
    }

    if (samples.length === 0) return null;

    // 平均輝度が閾値より暗ければ線と判定
    const avgLum = samples.reduce((s, c) => s + (c.r + c.g + c.b) / 3, 0) / samples.length;
    if (avgLum < 255 - lineThreshold) {
      return calculateMedianColor(samples);
    }
    return null;
  };

  // 上端チェック
  const topLine = checkHorizontalLine(rect.y - checkPadding);
  if (topLine) {
    ctx.strokeStyle = `rgb(${topLine.r}, ${topLine.g}, ${topLine.b})`;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(rect.x - checkPadding, rect.y);
    ctx.lineTo(rect.x + rect.width + checkPadding, rect.y);
    ctx.stroke();
  }

  // 下端チェック
  const bottomLine = checkHorizontalLine(rect.y + rect.height + checkPadding);
  if (bottomLine) {
    ctx.strokeStyle = `rgb(${bottomLine.r}, ${bottomLine.g}, ${bottomLine.b})`;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(rect.x - checkPadding, rect.y + rect.height);
    ctx.lineTo(rect.x + rect.width + checkPadding, rect.y + rect.height);
    ctx.stroke();
  }
}

/**
 * 背景の複雑度を判定
 *
 * @returns true: 複雑な背景（Inpainting推奨）
 */
export function isBackgroundComplex(
  samples: RGBColor[],
  threshold: number = 40
): boolean {
  if (samples.length < 4) return false;

  // 各チャンネルの標準偏差を計算
  const avg = calculateAverageColor(samples);

  let variance = 0;
  for (const s of samples) {
    variance += Math.pow(s.r - avg.r, 2) + Math.pow(s.g - avg.g, 2) + Math.pow(s.b - avg.b, 2);
  }
  variance /= samples.length * 3;

  return Math.sqrt(variance) > threshold;
}
