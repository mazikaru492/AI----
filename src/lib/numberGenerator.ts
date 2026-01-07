/**
 * ランダム数値生成ユーティリティ
 * 問題タイプに応じた真のランダム数値を生成
 */

export interface NumberReplacement {
  original: string;
  replacement: string;
}

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
 * 複数の数値を一括でランダム変換
 */
export function generateRandomReplacements(
  numbers: string[]
): NumberReplacement[] {
  // 同じ値には同じ置換を適用するためのマップ
  const replacementMap = new Map<string, string>();

  return numbers.map((original) => {
    // 既に変換済みの数値は同じ値を使用
    if (replacementMap.has(original)) {
      return {
        original,
        replacement: replacementMap.get(original)!,
      };
    }

    // 新しい数値を生成（元の数値と異なる値を保証）
    let replacement: string;
    let attempts = 0;
    do {
      replacement = generateRandomNumber(original);
      attempts++;
    } while (replacement === original && attempts < 10);

    replacementMap.set(original, replacement);

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
