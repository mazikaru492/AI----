/**
 * 履歴関連の型定義
 */

/** 履歴エントリ（Supabase の conversion_history テーブルと対応） */
export interface HistoryEntry {
  /** 一意のID (UUID) */
  id: string;
  /** 作成日時（表示用文字列） */
  createdAt: string;
  /** 変換サマリー（例: "3個の数字を変換"） */
  summary: string;
  /** 検出・変換した数字の個数 */
  numbersDetected: number;
}
