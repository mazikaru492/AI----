/**
 * Canvas操作ユーティリティ
 * Precision Masking - 正確なマスキングと背景色検出
 */

import type { BoundingBox, NumberReplacement } from '@/types';

/**
 * RGB色のルミナンス（明るさ）を計算
 * 人間の目の感度に基づく加重平均
 */
function calculateLuminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * 「最輝ピクセル」ルールで背景色を検出
 *
 * 新ロジック:
 * 1. bboxの境界周辺のピクセルをサンプリング
 * 2. 平均ではなく、最も明るいピクセルを選択
 * 3. 閾値チェック: RGB > 200 なら純白 #FFFFFF を返す
 */
function sampleBrightestBackgroundColor(
  ctx: CanvasRenderingContext2D,
  bbox: BoundingBox
): string {
  const canvas = ctx.canvas;
  const { x, y, width, height } = bbox;

  // サンプリング位置: bboxの境界の外側1px
  const samplePositions: Array<{ sx: number; sy: number }> = [];

  // 上辺の外側
  for (let i = 0; i < width; i += 3) {
    samplePositions.push({ sx: Math.floor(x + i), sy: Math.max(0, Math.floor(y) - 1) });
  }
  // 下辺の外側
  for (let i = 0; i < width; i += 3) {
    samplePositions.push({ sx: Math.floor(x + i), sy: Math.min(canvas.height - 1, Math.floor(y + height) + 1) });
  }
  // 左辺の外側
  for (let i = 0; i < height; i += 3) {
    samplePositions.push({ sx: Math.max(0, Math.floor(x) - 1), sy: Math.floor(y + i) });
  }
  // 右辺の外側
  for (let i = 0; i < height; i += 3) {
    samplePositions.push({ sx: Math.min(canvas.width - 1, Math.floor(x + width) + 1), sy: Math.floor(y + i) });
  }

  let brightestR = 0;
  let brightestG = 0;
  let brightestB = 0;
  let maxLuminance = 0;

  try {
    for (const { sx, sy } of samplePositions) {
      // 境界チェック
      if (sx < 0 || sx >= canvas.width || sy < 0 || sy >= canvas.height) continue;

      const imageData = ctx.getImageData(sx, sy, 1, 1);
      const [r, g, b] = imageData.data;
      const luminance = calculateLuminance(r, g, b);

      if (luminance > maxLuminance) {
        maxLuminance = luminance;
        brightestR = r;
        brightestG = g;
        brightestB = b;
      }
    }

    // 閾値チェック: 最輝ピクセルがほぼ白なら純白を返す
    const WHITE_THRESHOLD = 200;
    if (brightestR > WHITE_THRESHOLD && brightestG > WHITE_THRESHOLD && brightestB > WHITE_THRESHOLD) {
      return '#FFFFFF';
    }

    return `rgb(${brightestR}, ${brightestG}, ${brightestB})`;
  } catch {
    return '#FFFFFF';
  }
}

/**
 * フォントサイズを計算（ボックス高さベース）
 */
function calculateFontSize(boxHeight: number): number {
  // 高さの80%をフォントサイズとして使用（少し小さめに）
  const fontSize = Math.floor(boxHeight * 0.80);
  return Math.max(10, Math.min(64, fontSize));
}

/**
 * Canvas上で数値を精密に置換（Precision Masking）
 */
export function replaceNumbersOnCanvas(
  ctx: CanvasRenderingContext2D,
  replacements: NumberReplacement[],
  options: {
    fontFamily?: string;
    fontColor?: string;
    padding?: number;
  } = {}
): void {
  const {
    fontFamily = 'sans-serif',
    fontColor = '#000000',
    padding = 0,
  } = options;

  for (const { bbox, replacement: newText } of replacements) {
    if (!bbox) continue;
    const { x, y, width, height } = bbox;

    // 1. 背景色を「最輝ピクセル」ルールでサンプリング
    const bgColor = sampleBrightestBackgroundColor(ctx, bbox);

    // 2. 元の数値を消去（厳密にbbox内のみ）
    ctx.fillStyle = bgColor;
    ctx.fillRect(
      x + padding,
      y + padding,
      width - padding * 2,
      height - padding * 2
    );

    // 3. 新しい数値を描画
    const fontSize = calculateFontSize(height);
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.fillStyle = fontColor;

    // 完璧な中央配置
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // ボックスの正確な中央に描画
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    ctx.fillText(newText, centerX, centerY);
  }
}

/**
 * 画像をCanvasに描画
 */
export function drawImageToCanvas(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  maxWidth?: number,
  maxHeight?: number
): { scale: number } {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context not available');

  let width = image.naturalWidth;
  let height = image.naturalHeight;
  let scale = 1;

  if (maxWidth && width > maxWidth) {
    scale = maxWidth / width;
    width = maxWidth;
    height = height * scale;
  }
  if (maxHeight && height > maxHeight) {
    const newScale = maxHeight / height;
    scale *= newScale;
    width = width * newScale;
    height = height * newScale;
  }

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(image, 0, 0, width, height);

  return { scale };
}

/**
 * Canvasをダウンロード可能な画像に変換
 */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string = 'image/png',
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob'));
        }
      },
      type,
      quality
    );
  });
}

/**
 * バウンディングボックスをスケール
 */
export function scaleBbox(bbox: BoundingBox, scale: number): BoundingBox {
  return {
    x: bbox.x * scale,
    y: bbox.y * scale,
    width: bbox.width * scale,
    height: bbox.height * scale,
  };
}

// Re-export types for backward compatibility
export type { BoundingBox, NumberReplacement } from '@/types';
