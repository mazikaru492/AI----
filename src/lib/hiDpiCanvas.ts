/**
 * High-DPI Canvas ユーティリティ
 *
 * Retina等のHigh-DPI環境でシャープなテキスト描画を実現し、
 * サブピクセル精度で位置調整を行うためのユーティリティ。
 *
 * 設計方針:
 * - setTransform で dpr を1回だけ設定
 * - 以後すべての操作は CSS ピクセル座標で行う
 * - サブピクセル座標（小数点以下）を保持してアンチエイリアスを活用
 */

/**
 * High-DPI Canvas セットアップ結果
 */
export interface HiDPICanvasContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dpr: number;           // devicePixelRatio
  cssWidth: number;      // CSS論理幅
  cssHeight: number;     // CSS論理高さ
}

/**
 * 正規化座標（0-1）からのbbox
 */
export interface NormalizedBbox {
  x_min: number;  // 0-1
  y_min: number;
  x_max: number;
  y_max: number;
}

/**
 * Canvas CSS座標系での矩形
 */
export interface CSSRect {
  x: number;      // CSS pixels（小数点以下も保持）
  y: number;
  width: number;
  height: number;
}

/**
 * High-DPI対応Canvasをセットアップ
 *
 * - 内部バッファ: cssWidth * dpr, cssHeight * dpr
 * - CSS表示サイズ: cssWidth, cssHeight
 * - Transform: (dpr, 0, 0, dpr, 0, 0) を1回設定
 *
 * 以後のすべての描画操作はCSS座標系で行える
 */
export function setupHiDPICanvas(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number
): HiDPICanvasContext {
  const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

  // 物理ピクセルサイズを設定（整数に丸める）
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);

  // CSS論理サイズを設定
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;

  const ctx = canvas.getContext('2d', {
    alpha: true,
    desynchronized: false,  // 同期描画で品質優先
  });

  if (!ctx) {
    throw new Error('Canvas 2D context を取得できませんでした');
  }

  // 一度だけ変換行列を設定
  // 以後はCSS座標で作業すれば自動的に物理ピクセルにスケールされる
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // テキスト描画品質設定
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  return { canvas, ctx, dpr, cssWidth, cssHeight };
}

/**
 * 正規化座標（0-1）をCanvas CSS座標に変換
 *
 * 重要: 丸め処理をしないことでサブピクセル精度を維持
 */
export function normalizedBboxToCSS(
  bbox: NormalizedBbox | [number, number, number, number],
  canvasCssWidth: number,
  canvasCssHeight: number
): CSSRect {
  // 配列形式にも対応
  const [x_min, y_min, x_max, y_max] = Array.isArray(bbox)
    ? bbox
    : [bbox.x_min, bbox.y_min, bbox.x_max, bbox.y_max];

  const x = x_min * canvasCssWidth;
  const y = y_min * canvasCssHeight;
  const width = (x_max - x_min) * canvasCssWidth;
  const height = (y_max - y_min) * canvasCssHeight;

  return { x, y, width, height };
}

/**
 * 元画像ピクセル座標をCanvas CSS座標に変換
 */
export function imagePixelToCSS(
  imgX: number,
  imgY: number,
  originalImgWidth: number,
  originalImgHeight: number,
  canvasCssWidth: number,
  canvasCssHeight: number
): { x: number; y: number } {
  return {
    x: (imgX / originalImgWidth) * canvasCssWidth,
    y: (imgY / originalImgHeight) * canvasCssHeight,
  };
}

/**
 * 描画オプション
 */
export interface DrawTextOptions {
  fontFamily?: string;
  color?: string;
  paddingRatio?: number;
  fontWeight?: string;
  minFontSize?: number;
}

/**
 * サブピクセル精度でテキストを描画
 *
 * textBaseline='middle' + textAlign='center' で中央揃え
 * x, y は小数点以下を含む座標を受け付け、アンチエイリアスで微調整
 */
export function drawTextAtSubpixel(
  ctx: CanvasRenderingContext2D,
  text: string,
  rect: CSSRect,
  options: DrawTextOptions = {}
): void {
  const {
    fontFamily = '"Yu Gothic", "Meiryo", system-ui, sans-serif',
    color = '#000000',
    paddingRatio = 0.1,
    fontWeight = 'normal',
    minFontSize = 6,
  } = options;

  // フォントサイズをbbox高さから計算
  const effectiveHeight = rect.height * (1 - paddingRatio * 2);
  const fontSize = Math.max(effectiveHeight * 0.85, minFontSize);

  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  // サブピクセル座標で描画（小数点以下を保持）
  const drawX = rect.x + rect.width / 2;
  const drawY = rect.y + rect.height / 2;

  ctx.fillText(text, drawX, drawY);
}

/**
 * 画像をHigh-DPI Canvasに描画
 */
export function drawImageToHiDPICanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  maxCssWidth: number = 600
): HiDPICanvasContext {
  const scale = Math.min(1, maxCssWidth / img.naturalWidth);
  const cssWidth = img.naturalWidth * scale;
  const cssHeight = img.naturalHeight * scale;

  const context = setupHiDPICanvas(canvas, cssWidth, cssHeight);
  context.ctx.drawImage(img, 0, 0, cssWidth, cssHeight);

  return context;
}

/**
 * リサイズ対応オブザーバーを作成
 */
export function createResizeObserver(
  canvas: HTMLCanvasElement,
  container: HTMLElement,
  onResize?: (ctx: HiDPICanvasContext) => void
): ResizeObserver {
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        const ctx = setupHiDPICanvas(canvas, width, height);
        onResize?.(ctx);
      }
    }
  });

  observer.observe(container);
  return observer;
}
