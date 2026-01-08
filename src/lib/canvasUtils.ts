/**
 * Canvas操作ユーティリティ
 * Natural Blend - 自然な見た目の数値置換
 */

/**
 * バウンディングボックス（ピクセル座標）
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 数値置換情報
 */
export interface NumberReplacement {
  original: string;
  replacement: string;
  bbox: BoundingBox;
}

/**
 * 近隣ピクセルの色をサンプリング（適応型背景取得）
 * ボックスの左上外側から背景色を推定
 */
function sampleBackgroundColor(
  ctx: CanvasRenderingContext2D,
  bbox: BoundingBox
): string {
  const canvas = ctx.canvas;

  // サンプル位置: ボックスの左上外側 (x-3, y-3) から 5x5 領域
  const sampleX = Math.max(0, Math.floor(bbox.x) - 3);
  const sampleY = Math.max(0, Math.floor(bbox.y) - 3);
  const sampleSize = 5;

  // キャンバス境界チェック
  const safeWidth = Math.min(sampleSize, canvas.width - sampleX);
  const safeHeight = Math.min(sampleSize, canvas.height - sampleY);

  if (safeWidth <= 0 || safeHeight <= 0) {
    return '#FFFFFF';
  }

  try {
    const imageData = ctx.getImageData(sampleX, sampleY, safeWidth, safeHeight);
    const data = imageData.data;

    let totalR = 0, totalG = 0, totalB = 0;
    const pixelCount = safeWidth * safeHeight;

    for (let i = 0; i < data.length; i += 4) {
      totalR += data[i];
      totalG += data[i + 1];
      totalB += data[i + 2];
    }

    const avgR = Math.round(totalR / pixelCount);
    const avgG = Math.round(totalG / pixelCount);
    const avgB = Math.round(totalB / pixelCount);

    return `rgb(${avgR}, ${avgG}, ${avgB})`;
  } catch {
    return '#FFFFFF';
  }
}

/**
 * フォントサイズを計算（ボックス高さベース）
 */
function calculateFontSize(boxHeight: number): number {
  // 高さの85%をフォントサイズとして使用
  const fontSize = Math.floor(boxHeight * 0.85);
  return Math.max(10, Math.min(64, fontSize));
}

/**
 * Canvas上で数値を自然に置換（Natural Blend）
 *
 * 処理フロー:
 * 1. 近隣ピクセルから背景色をサンプリング
 * 2. パディング付きで元の数値を消去
 * 3. 完璧な中央配置で新しい数値を描画
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
    padding = 2,
  } = options;

  for (const { bbox, replacement: newText } of replacements) {
    const { x, y, width, height } = bbox;

    // 1. 背景色をサンプリング（適応型マスキング）
    const bgColor = sampleBackgroundColor(ctx, bbox);

    // 2. 元の数値を消去（背景色で塗りつぶし）
    ctx.fillStyle = bgColor;
    ctx.fillRect(
      x - padding,
      y - padding,
      width + padding * 2,
      height + padding * 2
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
