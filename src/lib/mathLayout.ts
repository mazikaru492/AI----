/**
 * Math Layout Engine - 数式レイアウトエンジン
 *
 * 上付き(sup)/下付き(sub)/通常(base)の文字役割に応じて
 * 適切な位置・サイズで描画するためのレイアウト計算を行う。
 *
 * Perplexity.ai 改善指針に基づく実装:
 * 1. 「1文字単位の役割と相対位置・サイズ」をモデル化
 * 2. TextMetrics APIで精密な高さ計測
 * 3. X/Y位置を事前計算してから一括描画
 */

import type { BoundingBox, FontStyle } from './smartErase';

/**
 * 文字の役割
 */
export type TextRole = 'base' | 'sup' | 'sub';

/**
 * レイアウト設定
 */
export interface LayoutConfig {
  /** 上付き文字のサイズ比（ベースサイズに対する比率） */
  supScale: number;
  /** 下付き文字のサイズ比 */
  subScale: number;
  /** 上付き文字のYオフセット（ベースサイズに対する比率）- 上方向に移動 */
  supOffsetY: number;
  /** 下付き文字のYオフセット（ベースサイズに対する比率）- 下方向に移動 */
  subOffsetY: number;
  /** 上付き/下付き文字のXオフセット（親文字幅に対する比率） */
  scriptOffsetX: number;
}

/**
 * デフォルトレイアウト設定
 */
export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  supScale: 0.6,
  subScale: 0.6,
  supOffsetY: 0.35,
  subOffsetY: 0.2,
  scriptOffsetX: 0.9,
};

/**
 * フォント別のベースラインオフセット係数
 */
export const BASELINE_OFFSETS: Record<FontStyle | 'default', number> = {
  'maru-gothic': 0.78,
  'gothic': 0.80,
  'mincho': 0.82,
  'handwritten': 0.75,
  'default': 0.80,
};

/**
 * レイアウトされたトークン
 */
export interface LayoutToken {
  text: string;
  role: TextRole;
  /** 計算されたX座標 */
  layoutX: number;
  /** 計算されたY座標（ベースライン） */
  layoutY: number;
  /** 計算されたフォントサイズ */
  fontSize: number;
  /** 元のbbox */
  bbox: BoundingBox;
  /** フォントスタイル */
  fontStyle?: FontStyle;
}

/**
 * 検出された数字の情報（smartErase.tsから渡される）
 */
export interface DetectionInfo {
  text: string;
  bbox: BoundingBox;
  role: TextRole;
  baselineY?: number;
  fontStyle?: FontStyle;
  parentChar?: string;
}

/**
 * ベースフォントサイズを計算
 * bbox高さからフォントサイズを推定
 */
export function calculateBaseFontSize(
  ctx: CanvasRenderingContext2D,
  bboxHeight: number,
  minFontSize: number = 10
): number {
  // bboxの高さの90%をフォントサイズとして使用
  const calculatedSize = Math.round(bboxHeight * 0.9);
  return Math.max(calculatedSize, minFontSize);
}

/**
 * TextMetricsを使ってフォントサイズを調整
 * 目標の高さに合うようにフォントサイズを計算
 */
export function adjustFontSizeToFit(
  ctx: CanvasRenderingContext2D,
  text: string,
  targetHeight: number,
  fontFamily: string,
  initialFontSize: number
): number {
  // 初期フォントで実測
  ctx.font = `${initialFontSize}px ${fontFamily}`;
  const metrics = ctx.measureText(text);
  const actualHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;

  if (actualHeight <= 0) {
    return initialFontSize;
  }

  // 比率で調整
  const adjustedSize = (targetHeight / actualHeight) * initialFontSize;
  return Math.max(adjustedSize, 8); // 最小8px
}

/**
 * 役割に応じたY座標オフセットを計算
 */
export function calculateYOffset(
  role: TextRole,
  baseFontSize: number,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): number {
  switch (role) {
    case 'sup':
      // 上付き: ベースラインから上方向にオフセット
      return -baseFontSize * config.supOffsetY;
    case 'sub':
      // 下付き: ベースラインから下方向にオフセット
      return baseFontSize * config.subOffsetY;
    case 'base':
    default:
      return 0;
  }
}

/**
 * 役割に応じたフォントサイズを計算
 */
export function calculateFontSize(
  role: TextRole,
  baseFontSize: number,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): number {
  switch (role) {
    case 'sup':
      return baseFontSize * config.supScale;
    case 'sub':
      return baseFontSize * config.subScale;
    case 'base':
    default:
      return baseFontSize;
  }
}

/**
 * 検出情報からレイアウトトークンを生成
 */
export function createLayoutToken(
  detection: DetectionInfo,
  baseFontSize: number,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): LayoutToken {
  const { text, bbox, role, baselineY, fontStyle } = detection;

  // ベースラインY座標を計算
  const baselineOffset = BASELINE_OFFSETS[fontStyle ?? 'default'];
  const calculatedBaselineY = baselineY ?? (bbox.y + bbox.height * baselineOffset);

  // 役割に応じたフォントサイズ
  const fontSize = calculateFontSize(role, baseFontSize, config);

  // 役割に応じたYオフセット
  const yOffset = calculateYOffset(role, baseFontSize, config);
  const layoutY = calculatedBaselineY + yOffset;

  // X座標は元のbboxの中央
  const layoutX = bbox.x + bbox.width / 2;

  return {
    text,
    role,
    layoutX,
    layoutY,
    fontSize,
    bbox,
    fontStyle,
  };
}

/**
 * レイアウトトークンを描画
 */
export function renderLayoutToken(
  ctx: CanvasRenderingContext2D,
  token: LayoutToken,
  fontFamily: string
): void {
  ctx.font = `${token.fontSize}px ${fontFamily}`;
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // measureTextで幅を計算して中央揃え
  const metrics = ctx.measureText(token.text);
  const startX = token.layoutX - metrics.width / 2;

  ctx.fillText(token.text, startX, token.layoutY);
}

/**
 * 複数のトークンを一括描画
 */
export function renderAllTokens(
  ctx: CanvasRenderingContext2D,
  tokens: LayoutToken[],
  fontFamily: string
): void {
  for (const token of tokens) {
    renderLayoutToken(ctx, token, fontFamily);
  }
}
