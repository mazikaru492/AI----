/**
 * Smart Erase - ピクセルレベルのインク消去
 *
 * 背景色をサンプリングし、数字のインクのみを消去します。
 * 紙の質感や隣接する文字（x, +, = など）は保持されます。
 */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SmartEraseOptions {
  /** 輝度差の閾値（0-255）。これより暗いピクセルをインクとみなす */
  threshold?: number;
  /** ボックスの外側に追加するパディング（px） */
  padding?: number;
}

/**
 * RGB値から輝度（0-255）を計算
 */
function getLuminance(r: number, g: number, b: number): number {
  // ITU-R BT.601 輝度計算
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * バウンディングボックスの4隅から背景色をサンプリング
 */
function sampleBackgroundColor(
  imageData: ImageData,
  box: BoundingBox,
  canvasWidth: number,
  padding: number
): { r: number; g: number; b: number } {
  const { data } = imageData;
  const samples: { r: number; g: number; b: number }[] = [];

  // 4隅の座標（パディング分外側）
  const corners = [
    { x: Math.max(0, box.x - padding), y: Math.max(0, box.y - padding) }, // 左上
    { x: Math.min(canvasWidth - 1, box.x + box.width + padding), y: Math.max(0, box.y - padding) }, // 右上
    { x: Math.max(0, box.x - padding), y: box.y + box.height + padding }, // 左下
    { x: Math.min(canvasWidth - 1, box.x + box.width + padding), y: box.y + box.height + padding }, // 右下
  ];

  for (const corner of corners) {
    const idx = (corner.y * canvasWidth + corner.x) * 4;
    if (idx >= 0 && idx < data.length - 3) {
      samples.push({
        r: data[idx],
        g: data[idx + 1],
        b: data[idx + 2],
      });
    }
  }

  // 平均色を計算
  if (samples.length === 0) {
    return { r: 255, g: 255, b: 255 }; // デフォルトは白
  }

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
 * Canvas上の指定されたボックス内のインクピクセルを背景色で置換
 *
 * @param ctx - Canvas 2D コンテキスト
 * @param boxes - 消去対象のバウンディングボックス配列
 * @param options - 消去オプション
 */
export function smartErase(
  ctx: CanvasRenderingContext2D,
  boxes: BoundingBox[],
  options: SmartEraseOptions = {}
): void {
  const { threshold = 50, padding = 2 } = options;

  const canvas = ctx.canvas;
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;

  // 全体の画像データを取得
  const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
  const { data } = imageData;

  for (const box of boxes) {
    // ボックスの範囲をキャンバス内に制限
    const x1 = Math.max(0, Math.floor(box.x));
    const y1 = Math.max(0, Math.floor(box.y));
    const x2 = Math.min(canvasWidth, Math.ceil(box.x + box.width));
    const y2 = Math.min(canvasHeight, Math.ceil(box.y + box.height));

    // 背景色をサンプリング
    const bgColor = sampleBackgroundColor(imageData, box, canvasWidth, padding);
    const bgLuminance = getLuminance(bgColor.r, bgColor.g, bgColor.b);

    // ボックス内のピクセルを走査
    for (let y = y1; y < y2; y++) {
      for (let x = x1; x < x2; x++) {
        const idx = (y * canvasWidth + x) * 4;

        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        const pixelLuminance = getLuminance(r, g, b);

        // 背景より十分に暗い場合、インクとみなして置換
        if (bgLuminance - pixelLuminance > threshold) {
          data[idx] = bgColor.r;
          data[idx + 1] = bgColor.g;
          data[idx + 2] = bgColor.b;
          // アルファは変更しない
        }
      }
    }
  }

  // 変更を適用
  ctx.putImageData(imageData, 0, 0);
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
