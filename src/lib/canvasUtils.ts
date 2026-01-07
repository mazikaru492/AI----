/**
 * Canvas操作ユーティリティ
 * 画像上の数値を置換するための描画機能
 */

export interface NumberReplacement {
  original: string;
  replacement: string;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

/**
 * バウンディングボックス周囲のピクセル色を平均化して取得
 * @param ctx - Canvas 2D コンテキスト
 * @param bbox - 対象のバウンディングボックス
 * @param margin - 外側にサンプリングするマージン（デフォルト: 2px）
 * @returns 平均RGB色の文字列（例: 'rgb(255, 250, 245)'）
 */
function sampleSurroundingColor(
  ctx: CanvasRenderingContext2D,
  bbox: NumberReplacement['bbox'],
  margin: number = 2
): string {
  const canvas = ctx.canvas;
  const { x0, y0, x1, y1 } = bbox;

  // サンプリング領域の座標を計算（キャンバス境界内にクランプ）
  const sampleX0 = Math.max(0, Math.floor(x0) - margin);
  const sampleY0 = Math.max(0, Math.floor(y0) - margin);
  const sampleX1 = Math.min(canvas.width, Math.ceil(x1) + margin);
  const sampleY1 = Math.min(canvas.height, Math.ceil(y1) + margin);

  const width = sampleX1 - sampleX0;
  const height = sampleY1 - sampleY0;

  if (width <= 0 || height <= 0) {
    return '#FFFFFF'; // フォールバック
  }

  // 周囲の領域からピクセルデータを取得
  const imageData = ctx.getImageData(sampleX0, sampleY0, width, height);
  const data = imageData.data;

  let totalR = 0, totalG = 0, totalB = 0;
  let count = 0;

  // バウンディングボックス内部を除外して周囲のピクセルのみサンプリング
  const innerX0 = Math.floor(x0) - sampleX0;
  const innerY0 = Math.floor(y0) - sampleY0;
  const innerX1 = Math.ceil(x1) - sampleX0;
  const innerY1 = Math.ceil(y1) - sampleY0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // ボックス内部はスキップ
      if (x >= innerX0 && x < innerX1 && y >= innerY0 && y < innerY1) {
        continue;
      }

      const i = (y * width + x) * 4;
      totalR += data[i];
      totalG += data[i + 1];
      totalB += data[i + 2];
      count++;
    }
  }

  if (count === 0) {
    return '#FFFFFF'; // フォールバック
  }

  const avgR = Math.round(totalR / count);
  const avgG = Math.round(totalG / count);
  const avgB = Math.round(totalB / count);

  return `rgb(${avgR}, ${avgG}, ${avgB})`;
}

/**
 * フォントサイズを座標から推定
 */
function estimateFontSize(bbox: NumberReplacement['bbox']): number {
  const height = bbox.y1 - bbox.y0;
  // 高さを基準にフォントサイズを推定（やや小さめに）
  return Math.max(12, Math.floor(height * 0.85));
}

/**
 * Canvas上で数値を置換
 */
export function replaceNumbersOnCanvas(
  ctx: CanvasRenderingContext2D,
  replacements: NumberReplacement[],
  options: {
    fontFamily?: string;
    fontColor?: string;
    maskColor?: string;
    padding?: number;
  } = {}
): void {
  const {
    fontFamily = 'Arial, sans-serif',
    fontColor = '#000000',
    maskColor = '#FFFFFF',
    padding = 2,
  } = options;

  for (const replacement of replacements) {
    const { bbox, replacement: newText } = replacement;

    // 1. 周囲のピクセル色をサンプリングして適応型マスク色を取得
    const adaptiveMaskColor = sampleSurroundingColor(ctx, bbox);

    // 2. 元の数値をマスク（周囲の色で塗りつぶし）
    ctx.fillStyle = adaptiveMaskColor;
    ctx.fillRect(
      bbox.x0 - padding,
      bbox.y0 - padding,
      bbox.x1 - bbox.x0 + padding * 2,
      bbox.y1 - bbox.y0 + padding * 2
    );

    // 2. 新しい数値を描画
    const fontSize = estimateFontSize(bbox);
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.fillStyle = fontColor;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    // 中央に配置するための調整
    const textMetrics = ctx.measureText(newText);
    const textWidth = textMetrics.width;
    const bboxWidth = bbox.x1 - bbox.x0;
    const xOffset = (bboxWidth - textWidth) / 2;

    ctx.fillText(newText, bbox.x0 + xOffset, bbox.y0);
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

  // リサイズが必要な場合
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
 * 座標をスケールに合わせて変換
 */
export function scaleBbox(
  bbox: NumberReplacement['bbox'],
  scale: number
): NumberReplacement['bbox'] {
  return {
    x0: bbox.x0 * scale,
    y0: bbox.y0 * scale,
    x1: bbox.x1 * scale,
    y1: bbox.y1 * scale,
  };
}
