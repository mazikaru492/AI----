/**
 * 問題関連の型定義
 */

/** 個別の問題アイテム */
export interface ProblemItem {
  /** 問題ID（1から順に採番） */
  id: number;
  /** 元の問題文 */
  original: string;
  /** 作成された類題 */
  question: string;
  /** 類題の解答 */
  answer: string;
}

/** Gemini APIからの生成結果 */
export type GenerateResult = ProblemItem[];
