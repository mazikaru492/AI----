/**
 * 履歴関連の型定義
 */

import type { GenerateResult } from './problem';

/** 履歴エントリ */
export interface HistoryEntry {
  /** 一意のID */
  id: string;
  /** 作成日時（YYYY-MM-DD HH:mm 形式） */
  createdAt: string;
  /** 生成結果 */
  result: GenerateResult;
}
