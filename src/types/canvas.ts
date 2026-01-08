/**
 * Canvas操作関連の型定義
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
  bbox?: BoundingBox;
  confidence?: number;
}
