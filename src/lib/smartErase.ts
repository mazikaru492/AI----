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
 * 文字の役割（中学〜高校数学全範囲対応）
 */
export type TextRole =
  // 基本
  | 'base'              // 通常文字・数字
  | 'sup'               // 上付き（x²の2）
  | 'sub'               // 下付き（x₁の1）
  | 'sign'              // 先頭の±記号
  | 'operator'          // +, -, ×, ÷, =
  | 'relation'          // ≡, ∽, ⊂, ≤, ≥, ≠

  // 分数
  | 'fraction-bar'      // 分数線
  | 'fraction-num'      // 分子
  | 'fraction-den'      // 分母

  // 根号
  | 'sqrt-sign'         // √記号
  | 'sqrt-vinculum'     // √の横線
  | 'sqrt-content'      // 根号内

  // 大型演算子
  | 'sum-op'            // Σ
  | 'sum-lower'         // Σの下付き
  | 'sum-upper'         // Σの上付き
  | 'prod-op'           // Π
  | 'prod-lower'
  | 'prod-upper'
  | 'int-op'            // ∫
  | 'int-lower'
  | 'int-upper'
  | 'lim-op'            // lim
  | 'lim-sub'           // x→0, n→∞

  // 関数・括弧
  | 'func-name'         // sin, cos, tan, log, ln
  | 'paren-left'        // (, [, {
  | 'paren-right'       // ), ], }
  | 'abs-bar'           // |

  // ベクトル・行列
  | 'vector-arrow'      // ベクトル矢印
  | 'matrix-bracket'    // 行列括弧
  | 'matrix-element'    // 行列要素

  // その他
  | 'derivative-op'     // d/dx, ∂
  | 'prime'             // f', f''
  | 'infinity'          // ∞
  | 'factorial'         // !
  | 'degree'            // °
  | 'angle-symbol';     // ∠

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

// ====================================
// 安全フィルタリング（製品化Phase1）
// ====================================

/** 安全な数字パターン（1-2桁の整数のみ） */
const SAFE_NUMBER_RE = /^\d{1,2}$/;

/** 複雑構造を示す役割（これらはスキップ） */
const COMPLEX_ROLES: TextRole[] = [
  'fraction-bar', 'fraction-num', 'fraction-den',
  'sqrt-sign', 'sqrt-vinculum', 'sqrt-content',
  'sum-op', 'sum-lower', 'sum-upper',
  'prod-op', 'prod-lower', 'prod-upper',
  'int-op', 'int-lower', 'int-upper',
  'lim-op', 'lim-sub',
  'matrix-bracket', 'matrix-element',
];

/**
 * このトークンを安全に置換できるかを判定
 * 複雑構造や異常なbboxはスキップ
 */
function isSafeReplacementToken(
  detection: DetectedNumber,
  canvasWidth: number,
  canvasHeight: number
): boolean {
  const { text, bbox, role = 'base' } = detection;

  // 1. 単純な1-2桁の整数のみを対象
  if (!SAFE_NUMBER_RE.test(text)) {
    console.log(`[SafeFilter] Skip: "${text}" - not 1-2 digit number`);
    return false;
  }

  // 2. 複雑構造の役割はスキップ
  if (COMPLEX_ROLES.includes(role)) {
    console.log(`[SafeFilter] Skip: "${text}" - complex role: ${role}`);
    return false;
  }

  // 3. 上付き・下付きもスキップ（位置ずれのリスク高い）
  if (role === 'sup' || role === 'sub') {
    console.log(`[SafeFilter] Skip: "${text}" - script role: ${role}`);
    return false;
  }

  // 4. bbox異常検出
  // 幅または高さが0以下
  if (bbox.width <= 0 || bbox.height <= 0) {
    console.log(`[SafeFilter] Skip: "${text}" - invalid bbox size`);
    return false;
  }

  // 幅が画像全体の15%を超える（異常に大きい）
  if (bbox.width > canvasWidth * 0.15) {
    console.log(`[SafeFilter] Skip: "${text}" - bbox too wide`);
    return false;
  }

  // 高さが画像全体の10%を超える（異常に大きい）
  if (bbox.height > canvasHeight * 0.1) {
    console.log(`[SafeFilter] Skip: "${text}" - bbox too tall`);
    return false;
  }

  // 5. 位置が画像の端すぎる（右端5%以内はスキップ）
  if (bbox.x + bbox.width > canvasWidth * 0.95) {
    console.log(`[SafeFilter] Skip: "${text}" - too close to right edge`);
    return false;
  }

  // 6. 位置が画像の上端5%以内はスキップ（ヘッダー領域）
  if (bbox.y < canvasHeight * 0.05) {
    console.log(`[SafeFilter] Skip: "${text}" - too close to top edge`);
    return false;
  }

  console.log(`[SafeFilter] OK: "${text}" at (${bbox.x}, ${bbox.y})`);
  return true;
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

// ====================================
// Smart Blob Erasure (Flood-Fill Logic)
// ====================================

/**
 * インク判定の閾値
 */
const INK_THRESHOLD = 180;  // これより暗いピクセルをインクとみなす
const PAPER_THRESHOLD = 220; // これより明るいピクセルを紙とみなす

/**
 * ピクセル座標を1次元インデックスに変換
 */
function pixelIndex(x: number, y: number, width: number): number {
  return (y * width + x) * 4;
}

/**
 * 指定座標の輝度を取得
 */
function getPixelLuminance(data: Uint8ClampedArray, x: number, y: number, width: number): number {
  const idx = pixelIndex(x, y, width);
  if (idx < 0 || idx >= data.length - 3) return 255;
  return getLuminance(data[idx], data[idx + 1], data[idx + 2]);
}

/**
 * ピクセルがインク（暗い）かどうか
 */
function isInkPixel(luminance: number): boolean {
  return luminance < INK_THRESHOLD;
}

/**
 * Smart Blob Erasure の結果
 */
interface BlobEraseResult {
  success: boolean;
  erasedPixels: Set<number>;  // 消去されたピクセルのインデックス（y * width + x）
  centroidX: number;          // 重心X
  centroidY: number;          // 重心Y
  blobWidth: number;          // blob幅
  blobHeight: number;         // blob高さ
}

/**
 * Center-Out Ink Removal using BFS Flood-Fill
 *
 * bboxの中心付近から最も暗いピクセルを特定し、
 * そこから連結したインク領域のみを消去する。
 * 分数線や根号線など、数字と分離した構造は保護される。
 */
function floodFillErase(
  imageData: ImageData,
  bbox: BoundingBox,
  padding: number = 1
): BlobEraseResult {
  const { data, width: imgWidth, height: imgHeight } = imageData;

  // bbox範囲を計算（パディング付き）
  const x1 = Math.max(0, Math.floor(bbox.x - padding));
  const y1 = Math.max(0, Math.floor(bbox.y - padding));
  const x2 = Math.min(imgWidth - 1, Math.ceil(bbox.x + bbox.width + padding));
  const y2 = Math.min(imgHeight - 1, Math.ceil(bbox.y + bbox.height + padding));

  // Step 1: 中心付近で最も暗いピクセルを探す
  const centerX = Math.floor(bbox.x + bbox.width / 2);
  const centerY = Math.floor(bbox.y + bbox.height / 2);
  const searchRadius = Math.max(3, Math.min(bbox.width, bbox.height) / 4);

  let seedX = centerX;
  let seedY = centerY;
  let darkestLum = 255;

  // 中心から放射状に探索
  for (let dy = -searchRadius; dy <= searchRadius; dy++) {
    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      const px = Math.floor(centerX + dx);
      const py = Math.floor(centerY + dy);
      if (px < x1 || px > x2 || py < y1 || py > y2) continue;

      const lum = getPixelLuminance(data, px, py, imgWidth);
      if (lum < darkestLum) {
        darkestLum = lum;
        seedX = px;
        seedY = py;
      }
    }
  }

  // 最も暗いピクセルがインクでなければ失敗
  if (!isInkPixel(darkestLum)) {
    return {
      success: false,
      erasedPixels: new Set(),
      centroidX: centerX,
      centroidY: centerY,
      blobWidth: 0,
      blobHeight: 0,
    };
  }

  // Step 2: BFS Flood-Fill でインク領域をトラバース
  const visited = new Set<number>();
  const queue: [number, number][] = [[seedX, seedY]];
  const inkPixels: [number, number][] = [];

  // 4方向（8方向だとアンチエイリアス領域も拾いすぎる）
  const directions = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
    // 斜め方向も追加（細い線に対応）
    [-1, -1], [1, -1], [-1, 1], [1, 1],
  ];

  while (queue.length > 0) {
    const [cx, cy] = queue.shift()!;
    const key = cy * imgWidth + cx;

    if (visited.has(key)) continue;
    visited.add(key);

    // 範囲外チェック（bboxの少し外まで許容）
    const expandedMargin = 2;
    if (cx < x1 - expandedMargin || cx > x2 + expandedMargin ||
        cy < y1 - expandedMargin || cy > y2 + expandedMargin) {
      continue;
    }

    const lum = getPixelLuminance(data, cx, cy, imgWidth);

    // インクピクセルなら追加
    if (isInkPixel(lum)) {
      inkPixels.push([cx, cy]);

      // 隣接ピクセルをキューに追加
      for (const [dx, dy] of directions) {
        const nx = cx + dx;
        const ny = cy + dy;
        const nkey = ny * imgWidth + nx;
        if (!visited.has(nkey) && nx >= 0 && nx < imgWidth && ny >= 0 && ny < imgHeight) {
          queue.push([nx, ny]);
        }
      }
    }
  }

  // 最小blob面積チェック（ノイズ除外）
  const minBlobArea = Math.max(4, bbox.width * bbox.height * 0.05);
  if (inkPixels.length < minBlobArea) {
    return {
      success: false,
      erasedPixels: new Set(),
      centroidX: centerX,
      centroidY: centerY,
      blobWidth: 0,
      blobHeight: 0,
    };
  }

  // Step 3: 重心と範囲を計算
  let sumX = 0, sumY = 0;
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  const erasedSet = new Set<number>();
  for (const [px, py] of inkPixels) {
    sumX += px;
    sumY += py;
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
    erasedSet.add(py * imgWidth + px);
  }

  return {
    success: true,
    erasedPixels: erasedSet,
    centroidX: sumX / inkPixels.length,
    centroidY: sumY / inkPixels.length,
    blobWidth: maxX - minX + 1,
    blobHeight: maxY - minY + 1,
  };
}

/**
 * Dilation（膨張処理）でアンチエイリアスのエッジを消去
 */
function dilateErasedArea(
  erasedPixels: Set<number>,
  imgWidth: number,
  imgHeight: number,
  dilationRadius: number = 1
): Set<number> {
  const dilated = new Set(erasedPixels);

  for (const key of erasedPixels) {
    const y = Math.floor(key / imgWidth);
    const x = key % imgWidth;

    for (let dy = -dilationRadius; dy <= dilationRadius; dy++) {
      for (let dx = -dilationRadius; dx <= dilationRadius; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < imgWidth && ny >= 0 && ny < imgHeight) {
          dilated.add(ny * imgWidth + nx);
        }
      }
    }
  }

  return dilated;
}

/**
 * 消去領域を背景色で塗りつぶす
 */
function applyBlobErasure(
  ctx: CanvasRenderingContext2D,
  imageData: ImageData,
  erasedPixels: Set<number>,
  bgColor: { r: number; g: number; b: number }
): void {
  const { data, width } = imageData;

  for (const key of erasedPixels) {
    const idx = key * 4;
    if (idx >= 0 && idx < data.length - 3) {
      data[idx] = bgColor.r;
      data[idx + 1] = bgColor.g;
      data[idx + 2] = bgColor.b;
      // アルファは維持
    }
  }
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
  // Phase 1: 安全なトークンのみ消去・置換
  // ========================================

  // ImageDataを直接操作する（Blob消去用）
  let imageDataModified = false;

  for (const detection of detections) {
    const { text, bbox, fontStyle } = detection;

    // 安全フィルタ: 単純係数のみを対象
    if (!isSafeReplacementToken(detection, canvasWidth, canvasHeight)) {
      continue; // このトークンはスキップ（元画像のまま）
    }

    // 小さなボックスかどうかを判定し、パディングを調整
    const isSmallBox = bbox.height < smallBoxThreshold || bbox.width < smallBoxThreshold;
    const padding = isSmallBox ? 1 : basePadding;

    // Step 1: Smart Blob Erasure を試行
    const blobResult = floodFillErase(imageData, bbox, padding);

    let eraseSuccess = false;
    let centroidX = bbox.x + bbox.width / 2;
    let centroidY = bbox.y + bbox.height / 2;
    let effectiveBlobHeight = bbox.height;

    if (blobResult.success && blobResult.erasedPixels.size > 0) {
      // Flood-Fill 成功: Dilation でエッジを消去
      const dilatedPixels = dilateErasedArea(
        blobResult.erasedPixels,
        canvasWidth,
        canvasHeight,
        1 // 1px dilation
      );

      // 背景色を推定（ボーダーから）
      const bgColor = sampleBrightestBorderColor(imageData, bbox, padding, canvasWidth, canvasHeight);
      const fillColor = (bgColor.luminance < minBrightness)
        ? { r: 255, g: 255, b: 255 }
        : { r: bgColor.r, g: bgColor.g, b: bgColor.b };

      // ImageDataに直接書き込み
      applyBlobErasure(ctx, imageData, dilatedPixels, fillColor);
      imageDataModified = true;

      // 重心を使用して配置位置を決定
      centroidX = blobResult.centroidX;
      centroidY = blobResult.centroidY;
      effectiveBlobHeight = blobResult.blobHeight;
      eraseSuccess = true;

      console.log(`[BlobErase] OK: "${text}" - ${blobResult.erasedPixels.size}px erased, centroid=(${centroidX.toFixed(1)}, ${centroidY.toFixed(1)})`);
    }

    if (!eraseSuccess) {
      // Flood-Fill 失敗: 従来の矩形マスキングにフォールバック
      console.log(`[BlobErase] Fallback: "${text}" - using rectangle mask`);

      const eraseRect = calculateEraseRect(
        bbox,
        padding,
        imageData,
        canvasWidth,
        canvasHeight,
        minBrightness
      );

      // 矩形塗りつぶし（ImageData変更後にcontextで描画すると上書きされるので、後で別途処理）
      // ここでは一旦スキップし、後でcontextで描画
    }

    // 新しいランダム数字を生成
    const newNumber = generateDifferentNumber(text);
    replacements.set(text, newNumber);

    // フォントプリセットを取得
    const preset = getFontPreset(fontStyle);

    // フォントサイズを計算（blob高さまたはbboxに収まるよう調整）
    // NOTE: 0.75係数でより自然なサイズに（0.9は大きすぎた）
    const calculatedFontSize = Math.round(effectiveBlobHeight * 0.75);
    const fontSize = Math.max(calculatedFontSize, minFontSize);

    drawInfos.push({
      detection: {
        ...detection,
        // 重心座標で上書き（blobがあれば）
        bbox: eraseSuccess ? {
          x: centroidX - bbox.width / 2,
          y: centroidY - bbox.height / 2,
          width: bbox.width,
          height: bbox.height,
        } : bbox,
      },
      newNumber,
      preset,
      fontSize,
    });
  }

  // ImageDataの変更をCanvasに反映
  if (imageDataModified) {
    ctx.putImageData(imageData, 0, 0);
  }

  // Fallback用の矩形マスキング（blob消去に失敗した検出に対して）
  for (const { detection } of drawInfos) {
    const { bbox, text } = detection;

    // blob消去に成功したものはスキップ（既に消去済み）
    // 失敗したものだけ矩形マスキング
    const blobResult = floodFillErase(
      ctx.getImageData(
        Math.max(0, Math.floor(bbox.x - basePadding)),
        Math.max(0, Math.floor(bbox.y - basePadding)),
        Math.ceil(bbox.width + basePadding * 2),
        Math.ceil(bbox.height + basePadding * 2)
      ),
      { x: basePadding, y: basePadding, width: bbox.width, height: bbox.height },
      1
    );

    // まだインクが残っていれば矩形で消す
    if (blobResult.erasedPixels.size > 0) {
      const eraseRect = calculateEraseRect(
        bbox,
        basePadding,
        ctx.getImageData(0, 0, canvasWidth, canvasHeight),
        canvasWidth,
        canvasHeight,
        minBrightness
      );
      ctx.fillStyle = eraseRect.fillColor;
      ctx.fillRect(eraseRect.x1, eraseRect.y1, eraseRect.fillWidth, eraseRect.fillHeight);
    }
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
