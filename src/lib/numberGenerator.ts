/**
 * ランダム数値生成ユーティリティ
 * 問題タイプに応じた真のランダム数値を生成
 */

import type { NumberReplacement } from '@/types';

/**
 * 数値の桁数に応じたランダム数値を生成
 * 例: "12" -> 10-99の範囲でランダム
 */
export function generateRandomNumber(original: string): string {
  const digits = original.length;

  // 1桁の場合は1-9
  if (digits === 1) {
    return String(Math.floor(Math.random() * 9) + 1);
  }

  // 複数桁の場合
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

/**
 * 各検出を独立してユニークなランダム数値に変換
 * 同じ数字（例: "2"が3回）でも全て異なる値に変換される
 */
export function generateUniqueRandomReplacements(
  numbers: string[]
): NumberReplacement[] {
  const usedReplacements = new Set<string>();

  return numbers.map((original) => {
    let replacement: string;
    let attempts = 0;
    const maxAttempts = 50;

    // 元の数値と異なり、かつ未使用の値を生成
    do {
      replacement = generateRandomNumber(original);
      attempts++;
    } while (
      (replacement === original || usedReplacements.has(replacement)) &&
      attempts < maxAttempts
    );

    usedReplacements.add(replacement);
    return { original, replacement };
  });
}

/**
 * 数学的に妥当な数値かどうかを簡易チェック
 */
export function isReasonableNumber(num: string): boolean {
  const n = parseInt(num, 10);
  if (isNaN(n)) return false;
  if (n < 0) return false;
  if (n > 99999) return false; // 5桁以下に制限
  return true;
}
