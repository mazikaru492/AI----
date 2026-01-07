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

    // 1. 元の数値をマスク（白で塗りつぶし）
    ctx.fillStyle = maskColor;
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
