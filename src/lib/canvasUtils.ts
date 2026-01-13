/**
 * Canvas操作ユーティリティ
 * 画像の描画、数値の置換、Blob変換などの共通処理
 */

import type { BoundingBox, NumberReplacement } from '@/types';

// High-DPI対応ユーティリティをre-export
export * from './hiDpiCanvas';
export * from './backgroundMask';

/**
 * 画像をCanvasに描画（レガシー版、互換性のため維持）
 * @param canvas - 対象のCanvas要素
 * @param img - 描画する画像
 * @param maxWidth - 最大幅（デフォルト: 600）
 * @returns scale - 適用されたスケール
 * @deprecated High-DPI対応が必要な場合は drawImageToHiDPICanvas を使用してください
 */
export function drawImageToCanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  maxWidth = 600
): { scale: number } {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context を取得できませんでした');

  const scale = Math.min(1, maxWidth / img.naturalWidth);
  const width = img.naturalWidth * scale;
  const height = img.naturalHeight * scale;

  canvas.width = width;
  canvas.height = height;

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  return { scale };
}

/**
 * バウンディングボックスの周辺から背景色をサンプリング
 */
function sampleBackgroundColor(
  ctx: CanvasRenderingContext2D,
  bbox: BoundingBox,
  canvasWidth: number,
  canvasHeight: number
): { r: number; g: number; b: number } {
  const samples: { r: number; g: number; b: number }[] = [];
  const padding = 2;

  // 4隅の外側から色をサンプリング
  const samplePoints = [
    { x: Math.max(0, bbox.x - padding), y: Math.max(0, bbox.y - padding) },
    { x: Math.min(canvasWidth - 1, bbox.x + bbox.width + padding), y: Math.max(0, bbox.y - padding) },
    { x: Math.max(0, bbox.x - padding), y: Math.min(canvasHeight - 1, bbox.y + bbox.height + padding) },
    { x: Math.min(canvasWidth - 1, bbox.x + bbox.width + padding), y: Math.min(canvasHeight - 1, bbox.y + bbox.height + padding) },
  ];

  for (const point of samplePoints) {
    const imageData = ctx.getImageData(Math.floor(point.x), Math.floor(point.y), 1, 1);
    samples.push({
      r: imageData.data[0],
      g: imageData.data[1],
      b: imageData.data[2],
    });
  }

  // 平均色を計算
  const avg = samples.reduce(
    (acc, s) => ({ r: acc.r + s.r, g: acc.g + s.g, b: acc.b + s.b }),
    { r: 0, g: 0, b: 0 }
  );

  return {
    r: Math.round(avg.r / samples.length),
    g: Math.round(avg.g / samples.length),
    b: Math.round(avg.b / samples.length),
  };
}

/**
 * Canvas上で数値を置換
 * @param ctx - Canvas 2D コンテキスト
 * @param replacements - 置換情報の配列
 */
export function replaceNumbersOnCanvas(
  ctx: CanvasRenderingContext2D,
  replacements: NumberReplacement[]
): void {
  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;

  for (const rep of replacements) {
    if (!rep.bbox) continue;

    const { x, y, width, height } = rep.bbox;

    // 背景色をサンプリング
    const bgColor = sampleBackgroundColor(ctx, rep.bbox, canvasWidth, canvasHeight);

    // 背景を塗りつぶし
    ctx.fillStyle = `rgb(${bgColor.r}, ${bgColor.g}, ${bgColor.b})`;
    ctx.fillRect(x, y, width, height);

    // 新しい数値を描画
    const fontSize = Math.max(12, Math.min(height * 0.9, width / rep.replacement.length * 1.5));
    ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(rep.replacement, x + width / 2, y + height / 2);
  }
}

/**
 * Canvas を Blob に変換
 */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = 'image/png',
  quality = 0.92
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Canvas を Blob に変換できませんでした'));
        }
      },
      type,
      quality
    );
  });
}

/**
 * Canvas を DataURL に変換
 */
export function canvasToDataUrl(
  canvas: HTMLCanvasElement,
  type = 'image/png',
  quality = 0.92
): string {
  return canvas.toDataURL(type, quality);
}
