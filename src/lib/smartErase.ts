/**
 * Smart Erase - 矩形塗りつぶしによる数字消去 + 新しい数字描画
 *
 * 「消しカス」問題を解決するため、ピクセル単位ではなく
 * 拡張された矩形全体を背景色で塗りつぶします。
 */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedNumber {
  text: string;
  bbox: BoundingBox;
}

export interface SmartEraseOptions {
  /** ボックスの外側に追加するパディング（px） - デフォルト: 2 */
  padding?: number;
  /** 背景色の最小輝度。これより暗い場合は白を使用 - デフォルト: 200 */
  minBrightness?: number;
}

/**
 * RGB値から輝度（0-255）を計算
 */
function getLuminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * 拡張ボックスの境界から最も明るいピクセル（背景色）をサンプリング
 * Morphological Dilation ロジック: 境界部分の最大輝度ピクセルを使用
 */
function sampleBrightestBorderColor(
  imageData: ImageData,
  box: BoundingBox,
  padding: number,
  canvasWidth: number,
  canvasHeight: number
): { r: number; g: number; b: number; luminance: number } {
  const { data } = imageData;

  // 拡張ボックスの範囲
  const x1 = Math.max(0, Math.floor(box.x - padding));
  const y1 = Math.max(0, Math.floor(box.y - padding));
  const x2 = Math.min(canvasWidth - 1, Math.ceil(box.x + box.width + padding));
  const y2 = Math.min(canvasHeight - 1, Math.ceil(box.y + box.height + padding));

  let brightest = { r: 255, g: 255, b: 255, luminance: 0 };

  // 上辺と下辺をサンプリング
  for (let x = x1; x <= x2; x++) {
    // 上辺
    const topIdx = (y1 * canvasWidth + x) * 4;
    if (topIdx >= 0 && topIdx < data.length - 3) {
      const lum = getLuminance(data[topIdx], data[topIdx + 1], data[topIdx + 2]);
      if (lum > brightest.luminance) {
        brightest = { r: data[topIdx], g: data[topIdx + 1], b: data[topIdx + 2], luminance: lum };
      }
    }
    // 下辺
    const bottomIdx = (y2 * canvasWidth + x) * 4;
    if (bottomIdx >= 0 && bottomIdx < data.length - 3) {
      const lum = getLuminance(data[bottomIdx], data[bottomIdx + 1], data[bottomIdx + 2]);
      if (lum > brightest.luminance) {
        brightest = { r: data[bottomIdx], g: data[bottomIdx + 1], b: data[bottomIdx + 2], luminance: lum };
      }
    }
  }

  // 左辺と右辺をサンプリング
  for (let y = y1; y <= y2; y++) {
    // 左辺
    const leftIdx = (y * canvasWidth + x1) * 4;
    if (leftIdx >= 0 && leftIdx < data.length - 3) {
      const lum = getLuminance(data[leftIdx], data[leftIdx + 1], data[leftIdx + 2]);
      if (lum > brightest.luminance) {
        brightest = { r: data[leftIdx], g: data[leftIdx + 1], b: data[leftIdx + 2], luminance: lum };
      }
    }
    // 右辺
    const rightIdx = (y * canvasWidth + x2) * 4;
    if (rightIdx >= 0 && rightIdx < data.length - 3) {
      const lum = getLuminance(data[rightIdx], data[rightIdx + 1], data[rightIdx + 2]);
      if (lum > brightest.luminance) {
        brightest = { r: data[rightIdx], g: data[rightIdx + 1], b: data[rightIdx + 2], luminance: lum };
      }
    }
  }

  return brightest;
}

/**
 * 数字だけが異なる新しいランダム数字を生成
 */
function generateDifferentNumber(original: string): string {
  // 数字のみを抽出
  const numericPart = original.replace(/\D/g, '');
  if (numericPart.length === 0) return original;

  // 各桁を異なる数字に変換
  let newNumber = '';
  for (const digit of numericPart) {
    const originalDigit = parseInt(digit, 10);
    let newDigit: number;
    do {
      newDigit = Math.floor(Math.random() * 10);
    } while (newDigit === originalDigit);
    newNumber += newDigit.toString();
  }

  return newNumber;
}

/**
 * Canvas上の指定されたボックスを消去し、新しい数字を描画
 *
 * @param ctx - Canvas 2D コンテキスト
 * @param detections - 検出された数字の配列（text + bbox）
 * @param options - 消去オプション
 * @returns 置換された数字のマッピング（デバッグ用）
 */
export function smartEraseAndReplace(
  ctx: CanvasRenderingContext2D,
  detections: DetectedNumber[],
  options: SmartEraseOptions = {}
): Map<string, string> {
  const { padding = 2, minBrightness = 200 } = options;

  const canvas = ctx.canvas;
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;

  // 全体の画像データを取得
  const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);

  // 置換マッピング
  const replacements = new Map<string, string>();

  for (const detection of detections) {
    const { text, bbox } = detection;

    // Step 1: 拡張ボックスの範囲を計算
    const x1 = Math.max(0, Math.floor(bbox.x - padding));
    const y1 = Math.max(0, Math.floor(bbox.y - padding));
    const x2 = Math.min(canvasWidth, Math.ceil(bbox.x + bbox.width + padding));
    const y2 = Math.min(canvasHeight, Math.ceil(bbox.y + bbox.height + padding));
    const fillWidth = x2 - x1;
    const fillHeight = y2 - y1;

    // Step 2: 境界から最も明るいピクセルをサンプリング
    const bgColor = sampleBrightestBorderColor(imageData, bbox, padding, canvasWidth, canvasHeight);

    // Step 3: 輝度が低すぎる場合は白を使用
    let fillColor: string;
    if (bgColor.luminance < minBrightness) {
      fillColor = '#FFFFFF';
    } else {
      fillColor = `rgb(${bgColor.r}, ${bgColor.g}, ${bgColor.b})`;
    }

    // Step 4: 拡張矩形全体を塗りつぶし（消しカス防止）
    ctx.fillStyle = fillColor;
    ctx.fillRect(x1, y1, fillWidth, fillHeight);

    // Step 5: 新しいランダム数字を生成
    const newNumber = generateDifferentNumber(text);
    replacements.set(text, newNumber);

    // Step 6: 新しい数字を描画
    const centerX = bbox.x + bbox.width / 2;
    const centerY = bbox.y + bbox.height / 2;
    const fontSize = Math.round(bbox.height * 0.85);

    ctx.fillStyle = '#222222'; // ダークグレー（インク色）
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(newNumber, centerX, centerY);
  }

  return replacements;
}

/**
 * 従来の smartErase 関数（互換性のため残す）
 * 消去のみを行い、数字の描画は行わない
 */
export function smartErase(
  ctx: CanvasRenderingContext2D,
  boxes: BoundingBox[],
  options: SmartEraseOptions = {}
): void {
  const { padding = 2, minBrightness = 200 } = options;

  const canvas = ctx.canvas;
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;

  const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);

  for (const bbox of boxes) {
    const x1 = Math.max(0, Math.floor(bbox.x - padding));
    const y1 = Math.max(0, Math.floor(bbox.y - padding));
    const x2 = Math.min(canvasWidth, Math.ceil(bbox.x + bbox.width + padding));
    const y2 = Math.min(canvasHeight, Math.ceil(bbox.y + bbox.height + padding));
    const fillWidth = x2 - x1;
    const fillHeight = y2 - y1;

    const bgColor = sampleBrightestBorderColor(imageData, bbox, padding, canvasWidth, canvasHeight);

    let fillColor: string;
    if (bgColor.luminance < minBrightness) {
      fillColor = '#FFFFFF';
    } else {
      fillColor = `rgb(${bgColor.r}, ${bgColor.g}, ${bgColor.b})`;
    }

    ctx.fillStyle = fillColor;
    ctx.fillRect(x1, y1, fillWidth, fillHeight);
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
