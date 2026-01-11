/**
 * Math Renderer - 数学記法描画エンジン
 *
 * 中学〜高校数学（数III）までの全記法に対応した描画ユーティリティ。
 * Perplexity.ai / LaTeX組版ロジックを参考にした実装。
 */

import type { BoundingBox, FontStyle, TextRole } from './smartErase';

// ====================================
// 型定義
// ====================================

/**
 * 数式トークン（描画単位）
 */
export interface MathToken {
  id?: string;
  text: string;
  role: TextRole;
  bbox?: BoundingBox;
  parentId?: string;
  groupId?: string;
  children?: MathToken[];
}

/**
 * レイアウトコンテキスト
 */
export interface LayoutContext {
  ctx: CanvasRenderingContext2D;
  baseFontFamily: string;
  baseFontSize: number;
  supScale: number;
  subScale: number;
  scriptShiftUp: number;
  scriptShiftDown: number;
}

/**
 * 分数レイアウト
 */
export interface FractionLayout {
  numerator: MathToken[];
  denominator: MathToken[];
}

/**
 * 根号レイアウト
 */
export interface SqrtLayout {
  radicand: MathToken[];
}

/**
 * 大型演算子レイアウト（Σ, Π, ∫, lim）
 */
export interface BigOpLayout {
  opText: string;
  lower?: MathToken[];
  upper?: MathToken[];
  body: MathToken[];
}

/**
 * 行列レイアウト
 */
export interface MatrixLayout {
  rows: MathToken[][][];
}

// ====================================
// フォントプリセット
// ====================================

export const FONT_FAMILIES: Record<FontStyle | 'default', string> = {
  'maru-gothic': '"Hiragino Maru Gothic ProN", "Yu Gothic", "Meiryo", system-ui, sans-serif',
  'gothic': '"Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", system-ui, sans-serif',
  'mincho': '"Hiragino Mincho ProN", "Yu Mincho", "MS Mincho", serif',
  'handwritten': '"Klee One", "Zen Kurenaido", cursive, system-ui, sans-serif',
  'default': '"Yu Gothic", "Meiryo", system-ui, sans-serif',
};

// ====================================
// デフォルト設定
// ====================================

export function createLayoutContext(
  ctx: CanvasRenderingContext2D,
  fontStyle?: FontStyle,
  baseFontSize: number = 24
): LayoutContext {
  return {
    ctx,
    baseFontFamily: FONT_FAMILIES[fontStyle ?? 'default'],
    baseFontSize,
    supScale: 0.6,
    subScale: 0.6,
    scriptShiftUp: 0.35,
    scriptShiftDown: 0.2,
  };
}

// ====================================
// ユーティリティ関数
// ====================================

/**
 * フォント設定
 */
function setFont(ctx: CanvasRenderingContext2D, size: number, family: string): void {
  ctx.font = `${size}px ${family}`;
}

/**
 * 役割に応じたフォントサイズを計算
 */
function getFontSizeForRole(role: TextRole, lc: LayoutContext): number {
  const { baseFontSize, supScale, subScale } = lc;

  switch (role) {
    case 'sup':
    case 'sum-upper':
    case 'int-upper':
      return baseFontSize * supScale;

    case 'sub':
    case 'sum-lower':
    case 'int-lower':
    case 'lim-sub':
      return baseFontSize * subScale;

    case 'fraction-num':
    case 'fraction-den':
      return baseFontSize * 0.8;

    case 'sqrt-content':
      return baseFontSize * 0.9;

    default:
      return baseFontSize;
  }
}

/**
 * 役割に応じたYオフセットを計算
 */
function getYOffsetForRole(role: TextRole, lc: LayoutContext): number {
  const { baseFontSize, scriptShiftUp, scriptShiftDown } = lc;

  switch (role) {
    case 'sup':
      return -baseFontSize * scriptShiftUp;

    case 'sub':
      return baseFontSize * scriptShiftDown;

    default:
      return 0;
  }
}

// ====================================
// メトリクス計測
// ====================================

export interface TextMetricsResult {
  width: number;
  ascent: number;
  descent: number;
}

/**
 * トークン列のメトリクスを計測
 */
export function measureTextRun(lc: LayoutContext, tokens: MathToken[]): TextMetricsResult {
  const { ctx, baseFontFamily } = lc;
  let width = 0;
  let ascent = 0;
  let descent = 0;

  for (const t of tokens) {
    const size = getFontSizeForRole(t.role, lc);
    setFont(ctx, size, baseFontFamily);

    const m = ctx.measureText(t.text);
    width += m.width;
    ascent = Math.max(ascent, m.actualBoundingBoxAscent || size * 0.8);
    descent = Math.max(descent, m.actualBoundingBoxDescent || size * 0.2);
  }

  return { width, ascent, descent };
}

// ====================================
// 基本描画関数
// ====================================

/**
 * トークン列を描画
 */
export function drawTextRun(
  lc: LayoutContext,
  tokens: MathToken[],
  x: number,
  baselineY: number
): number {
  const { ctx, baseFontFamily } = lc;
  let cursorX = x;

  for (const t of tokens) {
    const size = getFontSizeForRole(t.role, lc);
    setFont(ctx, size, baseFontFamily);

    const w = ctx.measureText(t.text).width;
    const yOffset = getYOffsetForRole(t.role, lc);

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#000000';
    ctx.fillText(t.text, cursorX, baselineY + yOffset);

    cursorX += w;
  }

  return cursorX;
}

// ====================================
// 分数描画
// ====================================

export function drawFraction(
  lc: LayoutContext,
  frac: FractionLayout,
  centerX: number,
  centerY: number
): void {
  const { ctx, baseFontSize } = lc;

  // 分子・分母のメトリクス計測
  const numMetrics = measureTextRun(lc, frac.numerator);
  const denMetrics = measureTextRun(lc, frac.denominator);

  const lineGap = baseFontSize * 0.15;
  const width = Math.max(numMetrics.width, denMetrics.width) * 1.1;

  // 分数線の位置
  const barY = centerY;
  const numBaseline = barY - lineGap - numMetrics.descent;
  const denBaseline = barY + lineGap + denMetrics.ascent;

  // 分数線を描画
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = baseFontSize * 0.06;
  ctx.beginPath();
  ctx.moveTo(centerX - width / 2, barY);
  ctx.lineTo(centerX + width / 2, barY);
  ctx.stroke();

  // 分子・分母を描画
  const numStartX = centerX - numMetrics.width / 2;
  const denStartX = centerX - denMetrics.width / 2;

  drawTextRun(lc, frac.numerator, numStartX, numBaseline);
  drawTextRun(lc, frac.denominator, denStartX, denBaseline);
}

// ====================================
// 根号描画
// ====================================

export function drawSqrt(
  lc: LayoutContext,
  sqrtLayout: SqrtLayout,
  x: number,
  baselineY: number
): number {
  const { ctx, baseFontSize } = lc;

  const contentMetrics = measureTextRun(lc, sqrtLayout.radicand);
  const padding = baseFontSize * 0.15;
  const rootWidth = baseFontSize * 0.5;

  const topY = baselineY - contentMetrics.ascent - padding;
  const bottomY = baselineY + contentMetrics.descent + padding * 0.3;

  // 根号記号を描画
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = baseFontSize * 0.05;
  ctx.beginPath();

  // 左下から始まる√の形
  const height = contentMetrics.ascent + contentMetrics.descent + padding * 2;
  ctx.moveTo(x, baselineY - height * 0.3);
  ctx.lineTo(x + rootWidth * 0.3, bottomY);
  ctx.lineTo(x + rootWidth, topY);
  ctx.lineTo(x + rootWidth + contentMetrics.width + padding, topY);
  ctx.stroke();

  // 中身を描画
  const contentX = x + rootWidth + padding / 2;
  drawTextRun(lc, sqrtLayout.radicand, contentX, baselineY);

  return x + rootWidth + contentMetrics.width + padding;
}

// ====================================
// 大型演算子描画（Σ, Π, ∫, lim）
// ====================================

export function drawBigOperator(
  lc: LayoutContext,
  layout: BigOpLayout,
  x: number,
  baselineY: number
): number {
  const { ctx, baseFontFamily, baseFontSize } = lc;

  // 演算子を大きく描画
  const bigSize = baseFontSize * 1.6;
  setFont(ctx, bigSize, baseFontFamily);

  const opMetrics = ctx.measureText(layout.opText);
  const opWidth = opMetrics.width;
  const opAscent = opMetrics.actualBoundingBoxAscent || bigSize * 0.8;
  const opDescent = opMetrics.actualBoundingBoxDescent || bigSize * 0.2;

  // 演算子を描画
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#000000';
  ctx.fillText(layout.opText, x, baselineY);

  // 下付き（lower）
  if (layout.lower && layout.lower.length > 0) {
    const lowerSize = baseFontSize * 0.6;
    const lowerLc = { ...lc, baseFontSize: lowerSize };
    const lowerMetrics = measureTextRun(lowerLc, layout.lower);
    const lowerBaseline = baselineY + opDescent + lowerSize * 0.8;
    const lowerX = x + opWidth / 2 - lowerMetrics.width / 2;
    drawTextRun(lowerLc, layout.lower, lowerX, lowerBaseline);
  }

  // 上付き（upper）
  if (layout.upper && layout.upper.length > 0) {
    const upperSize = baseFontSize * 0.6;
    const upperLc = { ...lc, baseFontSize: upperSize };
    const upperMetrics = measureTextRun(upperLc, layout.upper);
    const upperBaseline = baselineY - opAscent - upperSize * 0.3;
    const upperX = x + opWidth / 2 - upperMetrics.width / 2;
    drawTextRun(upperLc, layout.upper, upperX, upperBaseline);
  }

  // 本体（body）を描画
  const bodyX = x + opWidth + baseFontSize * 0.2;
  const endX = drawTextRun(lc, layout.body, bodyX, baselineY);

  return endX;
}

// ====================================
// ベクトル矢印描画
// ====================================

export function drawVector(
  lc: LayoutContext,
  token: MathToken,
  x: number,
  baselineY: number
): number {
  const { ctx, baseFontFamily, baseFontSize } = lc;

  setFont(ctx, baseFontSize, baseFontFamily);
  const m = ctx.measureText(token.text);

  // 文字を描画
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#000000';
  ctx.fillText(token.text, x, baselineY);

  // 矢印を描画
  const arrowY = baselineY - baseFontSize * 0.9;
  const startX = x;
  const endX = x + m.width;

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = baseFontSize * 0.05;
  ctx.beginPath();
  ctx.moveTo(startX, arrowY);
  ctx.lineTo(endX, arrowY);
  ctx.lineTo(endX - baseFontSize * 0.2, arrowY - baseFontSize * 0.1);
  ctx.moveTo(endX, arrowY);
  ctx.lineTo(endX - baseFontSize * 0.2, arrowY + baseFontSize * 0.1);
  ctx.stroke();

  return x + m.width;
}

// ====================================
// 行列描画
// ====================================

export function drawMatrix(
  lc: LayoutContext,
  layout: MatrixLayout,
  x: number,
  baselineY: number
): number {
  const { ctx, baseFontSize } = lc;

  // 各列の最大幅と各行の高さを計算
  const colWidths: number[] = [];
  const rowHeights: number[] = [];

  layout.rows.forEach((row, r) => {
    let maxAscent = 0;
    let maxDescent = 0;

    row.forEach((cell, c) => {
      const m = measureTextRun(lc, cell);
      colWidths[c] = Math.max(colWidths[c] ?? 0, m.width);
      maxAscent = Math.max(maxAscent, m.ascent);
      maxDescent = Math.max(maxDescent, m.descent);
    });

    rowHeights[r] = maxAscent + maxDescent + baseFontSize * 0.3;
  });

  const cellPadding = baseFontSize * 0.4;
  const totalWidth = colWidths.reduce((a, b) => a + b, 0) + cellPadding * (colWidths.length - 1);
  const totalHeight = rowHeights.reduce((a, b) => a + b, 0);

  const topY = baselineY - totalHeight / 2;
  const bracketWidth = baseFontSize * 0.2;

  // 左括弧
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = baseFontSize * 0.06;
  ctx.beginPath();
  ctx.moveTo(x + bracketWidth, topY);
  ctx.lineTo(x, topY);
  ctx.lineTo(x, topY + totalHeight);
  ctx.lineTo(x + bracketWidth, topY + totalHeight);
  ctx.stroke();

  // 右括弧
  const rightX = x + bracketWidth * 2 + totalWidth;
  ctx.beginPath();
  ctx.moveTo(rightX - bracketWidth, topY);
  ctx.lineTo(rightX, topY);
  ctx.lineTo(rightX, topY + totalHeight);
  ctx.lineTo(rightX - bracketWidth, topY + totalHeight);
  ctx.stroke();

  // 要素を描画
  let cursorY = topY;
  for (let r = 0; r < layout.rows.length; r++) {
    const row = layout.rows[r];
    const rowHeight = rowHeights[r];
    const rowBaseline = cursorY + rowHeight * 0.7;
    let cursorX = x + bracketWidth + baseFontSize * 0.1;

    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      const cellMetrics = measureTextRun(lc, cell);
      const cellX = cursorX + (colWidths[c] - cellMetrics.width) / 2;
      drawTextRun(lc, cell, cellX, rowBaseline);
      cursorX += colWidths[c] + cellPadding;
    }

    cursorY += rowHeight;
  }

  return rightX;
}
