/**
 * 共通ユーティリティ関数
 */

/**
 * 現在日時を YYYY-MM-DD HH:mm 形式でフォーマット
 */
export function formatNow(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

/**
 * 安全にUUIDを生成（crypto未対応環境ではタイムスタンプを使用）
 */
export function generateId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof (crypto as Crypto).randomUUID === 'function'
  ) {
    return (crypto as Crypto).randomUUID();
  }
  return String(Date.now());
}
