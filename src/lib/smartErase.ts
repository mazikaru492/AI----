/**
 * Smart Erase - 高精度テキスト置換
 *
 * Perplexity.ai 改善指針に基づく実装:
 * 1. フォントプリセットシステム
 * 2. textBaseline='alphabetic' + baselineOffset係数
 * 3. measureText()による幅計算と中央揃え
 * 4. 1文字ずつ描画によるカーニング再現
 * 5. 2フェーズ処理（全消去→一括描画）
 */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 文字ごとのバウンディングボックス（カーニング再現用）
 */
export interface CharBbox {
  char: string;
  xmin: number;
  xmax: number;
}

/**
 * フォントスタイル分類
 */
export type FontStyle = 'maru-gothic' | 'gothic' | 'mincho' | 'handwritten';

/**
 * 文字の役割（上付き/下付き/通常）
 */
export type TextRole = 'base' | 'sup' | 'sub';

export interface DetectedNumber {
  text: string;
  bbox: BoundingBox;
  /** テキストのベースライン位置（ピクセル） */
  baselineY?: number;
  /** 推定されたフォントスタイル */
  fontStyle?: FontStyle;
  /** 文字の役割（通常/上付き/下付き） */
  role?: TextRole;
  /** 親文字（上付き・下付きの場合のみ） */
  parentChar?: string;
  /** 各文字の個別バウンディングボックス */
  charBboxes?: CharBbox[];
}

export interface SmartEraseOptions {
  /** ボックスの外側に追加するパディング（px） - デフォルト: 2 */
  padding?: number;
  /** 背景色の最小輝度。これより暗い場合は白を使用 - デフォルト: 200 */
  minBrightness?: number;
  /** 最小フォントサイズ（px） - デフォルト: 10 */
  minFontSize?: number;
  /** 小さなボックスの閾値（px） - これ以下はパディング1pxを使用 - デフォルト: 20 */
  smallBoxThreshold?: number;
}

/**
 * フォントプリセット設定
 * 各フォントスタイルに対応するフォントファミリー、太さ、ベースラインオフセット係数
 */
interface FontPreset {
  family: string;
  weight: string;
  baselineOffset: number;
  letterSpacingFactor: number;
}

const FONT_PRESETS: Record<FontStyle, FontPreset> = {
  'maru-gothic': {
    family: '"Hiragino Maru Gothic ProN", "Yu Gothic", "Meiryo", system-ui, sans-serif',
    weight: 'normal',
    baselineOffset: 0.78,
    letterSpacingFactor: 0.05,
  },
  'gothic': {
    family: '"Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", system-ui, sans-serif',
    weight: 'normal',
    baselineOffset: 0.80,
    letterSpacingFactor: 0.05,
  },
  'mincho': {
    family: '"Hiragino Mincho ProN", "Yu Mincho", "MS Mincho", serif',
    weight: 'normal',
    baselineOffset: 0.82,
    letterSpacingFactor: 0.03,
  },
  'handwritten': {
    family: '"Klee One", "Zen Kurenaido", cursive, system-ui, sans-serif',
    weight: 'normal',
    baselineOffset: 0.75,
    letterSpacingFactor: 0.08,
  },
};

/** デフォルトフォントプリセット */
const DEFAULT_PRESET: FontPreset = FONT_PRESETS['gothic'];

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
 * フォントプリセットを取得
 */
function getFontPreset(fontStyle?: FontStyle): FontPreset {
  if (fontStyle && FONT_PRESETS[fontStyle]) {
    return FONT_PRESETS[fontStyle];
  }
  return DEFAULT_PRESET;
}

/**
 * 拡張ボックスの矩形情報を計算
 */
interface EraseRect {
  x1: number;
  y1: number;
  fillWidth: number;
  fillHeight: number;
  fillColor: string;
}

function calculateEraseRect(
  bbox: BoundingBox,
  padding: number,
  imageData: ImageData,
  canvasWidth: number,
  canvasHeight: number,
  minBrightness: number
): EraseRect {
  const x1 = Math.max(0, Math.floor(bbox.x - padding));
  const y1 = Math.max(0, Math.floor(bbox.y - padding));
  const x2 = Math.min(canvasWidth, Math.ceil(bbox.x + bbox.width + padding));
  const y2 = Math.min(canvasHeight, Math.ceil(bbox.y + bbox.height + padding));

  const bgColor = sampleBrightestBorderColor(imageData, bbox, padding, canvasWidth, canvasHeight);

  let fillColor: string;
  const isVeryBright = bgColor.r > 210 && bgColor.g > 210 && bgColor.b > 210;

  if (isVeryBright || bgColor.luminance < minBrightness) {
    fillColor = '#FFFFFF';
  } else {
    fillColor = `rgb(${bgColor.r}, ${bgColor.g}, ${bgColor.b})`;
  }

  return {
    x1,
    y1,
    fillWidth: x2 - x1,
    fillHeight: y2 - y1,
    fillColor,
  };
}

/**
 * 描画情報を保持
 */
interface DrawInfo {
  detection: DetectedNumber;
  newNumber: string;
  preset: FontPreset;
  fontSize: number;
}

/**
 * Canvas上の指定されたボックスを消去し、新しい数字を描画
 *
 * 2フェーズ処理:
 * 1. 全ての数字を先に消去
 * 2. 新しい数字を一括描画
 *
 * @param ctx - Canvas 2D コンテキスト
 * @param detections - 検出された数字の配列（text + bbox + オプショナル情報）
 * @param options - 消去オプション
 * @returns 置換された数字のマッピング（デバッグ用）
 */
export function smartEraseAndReplace(
  ctx: CanvasRenderingContext2D,
  detections: DetectedNumber[],
  options: SmartEraseOptions = {}
): Map<string, string> {
  const {
    padding: basePadding = 2,
    minBrightness = 200,
    minFontSize = 10,
    smallBoxThreshold = 20,
  } = options;

  const canvas = ctx.canvas;
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;

  // 全体の画像データを取得
  const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);

  // 置換マッピング
  const replacements = new Map<string, string>();

  // 描画情報を事前計算
  const drawInfos: DrawInfo[] = [];

  // ========================================
  // Phase 1: 全ての数字を消去
  // ========================================
  for (const detection of detections) {
    const { text, bbox, fontStyle } = detection;

    // 小さなボックスかどうかを判定し、パディングを調整
    const isSmallBox = bbox.height < smallBoxThreshold || bbox.width < smallBoxThreshold;
    const padding = isSmallBox ? 1 : basePadding;

    // 消去矩形を計算
    const eraseRect = calculateEraseRect(
      bbox,
      padding,
      imageData,
      canvasWidth,
      canvasHeight,
      minBrightness
    );

    // 拡張矩形全体を塗りつぶし（消しカス防止）
    ctx.fillStyle = eraseRect.fillColor;
    ctx.fillRect(eraseRect.x1, eraseRect.y1, eraseRect.fillWidth, eraseRect.fillHeight);

    // 新しいランダム数字を生成
    const newNumber = generateDifferentNumber(text);
    replacements.set(text, newNumber);

    // フォントプリセットを取得
    const preset = getFontPreset(fontStyle);

    // フォントサイズを計算（bboxに収まるよう調整）
    const calculatedFontSize = Math.round(bbox.height * 0.9);
    const fontSize = Math.max(calculatedFontSize, minFontSize);

    drawInfos.push({
      detection,
      newNumber,
      preset,
      fontSize,
    });
  }

  // ========================================
  // Phase 2: 新しい数字を一括描画（役割ベース）
  // ========================================

  // 役割に応じたオフセット係数
  const SUP_SCALE = 0.6;       // 上付きサイズ比
  const SUB_SCALE = 0.6;       // 下付きサイズ比
  const SUP_OFFSET_Y = 0.35;   // 上付きY offset（ベースサイズ比）- 上方向
  const SUB_OFFSET_Y = 0.2;    // 下付きY offset（ベースサイズ比）- 下方向

  for (const { detection, newNumber, preset, fontSize: baseFontSize } of drawInfos) {
    const { bbox, baselineY, charBboxes, role = 'base' } = detection;

    // 役割に応じたフォントサイズを計算
    let fontSize = baseFontSize;
    if (role === 'sup') {
      fontSize = Math.max(baseFontSize * SUP_SCALE, minFontSize);
    } else if (role === 'sub') {
      fontSize = Math.max(baseFontSize * SUB_SCALE, minFontSize);
    }

    // フォント設定
    ctx.font = `${preset.weight} ${fontSize}px ${preset.family}`;
    ctx.fillStyle = '#000000'; // 純黒（インク色）

    // ベースライン位置を計算
    let calculatedBaselineY = baselineY ?? (bbox.y + bbox.height * preset.baselineOffset);

    // 役割に応じたY座標オフセット
    if (role === 'sup') {
      // 上付き: ベースラインから上方向にオフセット
      calculatedBaselineY -= baseFontSize * SUP_OFFSET_Y;
    } else if (role === 'sub') {
      // 下付き: ベースラインから下方向にオフセット
      calculatedBaselineY += baseFontSize * SUB_OFFSET_Y;
    }

    // カーニング再現: charBboxesがある場合は1文字ずつ描画
    if (charBboxes && charBboxes.length > 0 && newNumber.length > 1) {
      drawWithKerning(ctx, newNumber, bbox, calculatedBaselineY, charBboxes, preset, fontSize);
    } else {
      // 通常描画: measureTextで中央揃え
      drawCentered(ctx, newNumber, bbox, calculatedBaselineY);
    }
  }

  return replacements;
}

/**
 * カーニングを再現して1文字ずつ描画
 */
function drawWithKerning(
  ctx: CanvasRenderingContext2D,
  text: string,
  bbox: BoundingBox,
  baselineY: number,
  charBboxes: CharBbox[],
  preset: FontPreset,
  fontSize: number
): void {
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // 元の文字間隔（advance）を計算
  const originalAdvances: number[] = [];
  for (let i = 0; i < charBboxes.length - 1; i++) {
    const advance = charBboxes[i + 1].xmin - charBboxes[i].xmin;
    originalAdvances.push(advance);
  }

  // 先頭文字の開始位置
  let cursorX = bbox.x;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    ctx.fillText(ch, cursorX, baselineY);

    // 次の文字位置を計算
    const charWidth = ctx.measureText(ch).width;
    const origAdvance = originalAdvances[i];

    if (origAdvance !== undefined && origAdvance > 0) {
      // 元の間隔を使用
      cursorX += origAdvance;
    } else {
      // フォールバック: 文字幅 + レタースペーシング
      cursorX += charWidth + fontSize * preset.letterSpacingFactor;
    }
  }
}

/**
 * 中央揃えで描画
 */
function drawCentered(
  ctx: CanvasRenderingContext2D,
  text: string,
  bbox: BoundingBox,
  baselineY: number
): void {
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // measureTextで幅を計算して中央揃え
  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const centerX = bbox.x + bbox.width / 2;
  const startX = centerX - textWidth / 2;

  ctx.fillText(text, startX, baselineY);
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
    const isVeryBright = bgColor.r > 210 && bgColor.g > 210 && bgColor.b > 210;

    if (isVeryBright || bgColor.luminance < minBrightness) {
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
