export interface FallbackDecision {
  shouldFallback: boolean;
  isRateLimit: boolean;
  isNotFound: boolean;
}

/**
 * APIコスト削減のため、再試行が妥当なエラーだけ次モデルへフォールバックする。
 * パースエラー・入力不正などは即時停止して無駄な呼び出しを防ぐ。
 */
export function getFallbackDecision(error: unknown): FallbackDecision {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  const isRateLimit =
    message.includes("429") ||
    message.includes("quota") ||
    message.includes("rate limit") ||
    message.includes("resource exhausted");

  const isNotFound = message.includes("404") || message.includes("not found");

  return {
    shouldFallback: isRateLimit || isNotFound,
    isRateLimit,
    isNotFound,
  };
}
