/**
 * GLM-OCR レスポンスパーサー
 *
 * GLM-OCR（Z.AI）が返す LaTeX/Markdown テキストから
 * 数字（0-9）とその役割を抽出し、smartErase.ts で使う
 * DetectedNumber 形式に変換する。
 *
 * GLM-OCR は座標情報を返さないため、
 * 別途 Gemini Vision の座標と LaTeX の構造情報を組み合わせる
 * 「ハイブリッドモード」で使用する。
 */

import type { DetectedNumber } from "./smartErase";

// ====================================
// Types
// ====================================

/**
 * LaTeX トークン（パース結果の中間表現）
 */
export interface LatexToken {
  /** 抽出された数字テキスト */
  text: string;
  /** 数式内の役割 */
  role:
    | "base"
    | "sup"
    | "sub"
    | "fraction-num"
    | "fraction-den"
    | "sqrt-content"
    | "lim-sub"
    | "sum-lower"
    | "sum-upper"
    | "int-lower"
    | "int-upper";
  /** 親トークン（上付き下付きの場合） */
  parentText?: string;
  /** 元LaTeXスニペット（デバッグ用） */
  sourceSnippet?: string;
}

/**
 * GLM-OCR クラウドAPIのレスポンス形式
 */
export interface GlmOcrResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ====================================
// LaTeX パターン定義
// ====================================

/** 分数: \frac{num}{den} */
const FRAC_RE = /\\frac\{([^}]+)\}\{([^}]+)\}/g;

/** 上付き: x^{2} または x^2 */
const SUP_RE = /\^(?:\{([^}]+)\}|(\d+))/g;

/** 下付き: x_{1} または x_1 */
const SUB_RE = /_(?:\{([^}]+)\}|(\d+))/g;

/** 根号: \sqrt{2} または \sqrt[3]{x} */
const SQRT_RE = /\\sqrt(?:\[([^\]]+)\])?\{([^}]+)\}/g;

/** 極限: \lim_{x \to 0} */
const LIM_RE = /\\lim_\{([^}]+)\}/g;

/** 総和: \sum_{k=1}^{n} */
const SUM_RE = /\\sum_\{([^}]+)\}\^\{([^}]+)\}/g;

/** 積分: \int_{0}^{1} */
const INT_RE = /\\int_\{([^}]+)\}\^\{([^}]+)\}/g;

/** 通常の数字（1-2桁の整数） */
const PLAIN_NUM_RE = /(?<![\\a-zA-Z{^_])(\d{1,2})(?![a-zA-Z}])/g;

// ====================================
// パーサー関数
// ====================================

/**
 * LaTeX/Markdown テキストから数字トークンを抽出
 */
export function parseLatexTokens(latexText: string): LatexToken[] {
  const tokens: LatexToken[] = [];
  const seen = new Set<string>(); // 重複除去用キー

  // ---- 分数 ----
  for (const m of latexText.matchAll(FRAC_RE)) {
    const [full, num, den] = m;
    extractDigits(num).forEach((d) =>
      addToken(tokens, seen, {
        text: d,
        role: "fraction-num",
        sourceSnippet: full,
      }),
    );
    extractDigits(den).forEach((d) =>
      addToken(tokens, seen, {
        text: d,
        role: "fraction-den",
        sourceSnippet: full,
      }),
    );
  }

  // ---- 根号 ----
  for (const m of latexText.matchAll(SQRT_RE)) {
    const [full, , content] = m;
    extractDigits(content).forEach((d) =>
      addToken(tokens, seen, {
        text: d,
        role: "sqrt-content",
        sourceSnippet: full,
      }),
    );
  }

  // ---- 極限 ----
  for (const m of latexText.matchAll(LIM_RE)) {
    const [full, sub] = m;
    extractDigits(sub).forEach((d) =>
      addToken(tokens, seen, {
        text: d,
        role: "lim-sub",
        sourceSnippet: full,
      }),
    );
  }

  // ---- Σ ----
  for (const m of latexText.matchAll(SUM_RE)) {
    const [full, lower, upper] = m;
    extractDigits(lower).forEach((d) =>
      addToken(tokens, seen, {
        text: d,
        role: "sum-lower",
        sourceSnippet: full,
      }),
    );
    extractDigits(upper).forEach((d) =>
      addToken(tokens, seen, {
        text: d,
        role: "sum-upper",
        sourceSnippet: full,
      }),
    );
  }

  // ---- ∫ ----
  for (const m of latexText.matchAll(INT_RE)) {
    const [full, lower, upper] = m;
    extractDigits(lower).forEach((d) =>
      addToken(tokens, seen, {
        text: d,
        role: "int-lower",
        sourceSnippet: full,
      }),
    );
    extractDigits(upper).forEach((d) =>
      addToken(tokens, seen, {
        text: d,
        role: "int-upper",
        sourceSnippet: full,
      }),
    );
  }

  // ---- 上付き ----
  for (const m of latexText.matchAll(SUP_RE)) {
    const [full, braced, bare] = m;
    const content = braced ?? bare;
    extractDigits(content).forEach((d) =>
      addToken(tokens, seen, {
        text: d,
        role: "sup",
        sourceSnippet: full,
      }),
    );
  }

  // ---- 下付き ----
  for (const m of latexText.matchAll(SUB_RE)) {
    const [full, braced, bare] = m;
    const content = braced ?? bare;
    extractDigits(content).forEach((d) =>
      addToken(tokens, seen, {
        text: d,
        role: "sub",
        sourceSnippet: full,
      }),
    );
  }

  // ---- 通常の係数（1-2桁のみ） ----
  // 既に複雑構造で収集済みのものはスキップし、それ以外だけ追加
  for (const m of latexText.matchAll(PLAIN_NUM_RE)) {
    const digit = m[1];
    addToken(tokens, seen, { text: digit, role: "base" });
  }

  return tokens;
}

/**
 * 文字列から1-2桁の整数を全て抽出
 */
function extractDigits(src: string): string[] {
  const results: string[] = [];
  for (const m of src.matchAll(/\d{1,2}/g)) {
    results.push(m[0]);
  }
  return results;
}

/**
 * 重複を避けてトークンを追加
 * 同じ (text + role) の組み合わせは1つだけ保持
 */
function addToken(
  tokens: LatexToken[],
  seen: Set<string>,
  token: LatexToken,
): void {
  const key = `${token.text}:${token.role}`;
  if (!seen.has(key)) {
    seen.add(key);
    tokens.push(token);
  }
}

// ====================================
// 座標マッチング
// ====================================

/**
 * Gemini の座標検出結果と GLM-OCR の LaTeX 構造を統合
 *
 * GLM-OCR は構造（役割）を正確に識別し、
 * Gemini は座標（bbox）を提供する。
 * 両者を text でマッチングして最良の DetectedNumber[] を返す。
 */
export function mergeGlmOcrWithCoordinates(
  geminiDetections: DetectedNumber[],
  glmTokens: LatexToken[],
): DetectedNumber[] {
  // GLM-OCR の役割マップ: text → role（最も優先度の高い役割）
  const roleMap = new Map<string, LatexToken["role"]>();

  // 役割の優先度（複雑構造 > 通常）
  const ROLE_PRIORITY: Record<LatexToken["role"], number> = {
    "fraction-num": 10,
    "fraction-den": 10,
    "sqrt-content": 10,
    "lim-sub": 10,
    "sum-lower": 10,
    "sum-upper": 10,
    "int-lower": 10,
    "int-upper": 10,
    sup: 5,
    sub: 5,
    base: 1,
  };

  for (const token of glmTokens) {
    const existing = roleMap.get(token.text);
    const existingPriority = existing ? ROLE_PRIORITY[existing] : 0;
    const newPriority = ROLE_PRIORITY[token.role];
    if (newPriority > existingPriority) {
      roleMap.set(token.text, token.role);
    }
  }

  // Gemini の座標に GLM-OCR の役割を適用
  return geminiDetections.map((d) => {
    const glmRole = roleMap.get(d.text);
    if (!glmRole) return d; // GLM-OCR に対応なし → そのまま

    return {
      ...d,
      role: glmRole as DetectedNumber["role"],
    };
  });
}

// ====================================
// GLM-OCR LaTeX 全文からの数字抽出
// ====================================

/**
 * GLM-OCR のレスポンス全文を解析し、LaTeX トークンを返す
 * （座標なし - mergeGlmOcrWithCoordinates で座標と統合する）
 */
export function analyzeGlmOcrResponse(responseText: string): {
  tokens: LatexToken[];
  rawText: string;
} {
  // コードブロックを除去して LaTeX 部分だけ抽出
  const cleaned = responseText
    .replace(/```[a-z]*\n?/g, "") // コードフェンス
    .replace(/\n{3,}/g, "\n\n") // 連続改行を圧縮
    .trim();

  const tokens = parseLatexTokens(cleaned);

  console.log(`[GLM-OCR Parser] Extracted ${tokens.length} tokens`);
  console.log(
    "[GLM-OCR Parser] Roles:",
    tokens.map((t) => `${t.text}:${t.role}`).join(", "),
  );

  return { tokens, rawText: cleaned };
}
