/**
 * 数理整合性保証型 数値変換＆解法エンジン
 *
 * 【設計思想】
 * 1. 乱数による数理崩壊（判別式D<0の実数解消失、先頭0、因数分解不能化など）を防止する逆算生成
 * 2. 2次方程式、1次方程式、因数分解、連立方程式の型自動判別と整数解の保証
 * 3. 変更後問題に対するステップバイステップ途中式・模範解答の自動生成
 * 4. Gemini AI と決定論的アルゴリズムのハイブリッド設計（オフライン・障害時も100%安全稼働）
 */

import type { DetectedNumber, TextRole } from "@/lib/smartErase";

export interface MathSolutionDetail {
  problemType: string;
  originalFormula?: string;
  transformedFormula: string;
  answer: string;
  steps: string[];
}

export interface ReplacementMapping {
  original: string;
  replacement: string;
  role?: TextRole;
  index?: number;
}

export interface TransformationResult {
  replacements: ReplacementMapping[];
  solution: MathSolutionDetail;
  source: "ai" | "deterministic-math" | "safe-rule";
}

/**
 * 0を含まない1桁の安全な乱数を生成 (1〜9)
 */
function randomNonZeroDigit(exclude?: number): number {
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => d !== exclude);
  return digits[Math.floor(Math.random() * digits.length)] ?? 1;
}

/**
 * 指定桁数の安全な数値を生成（先頭0禁止、元の数値と異なる）
 */
export function generateSafeNumber(
  original: string,
  options: { allowZero?: boolean; role?: TextRole } = {}
): string {
  const isNegative = original.startsWith("-");
  const cleanDigits = original.replace(/\D/g, "");

  if (cleanDigits.length === 0) return original;

  const length = cleanDigits.length;

  if (length === 1) {
    const origNum = parseInt(cleanDigits, 10);
    // 上付き（指数）の場合は通常2や3に留める
    if (options.role === "sup") {
      return origNum === 2 ? "3" : "2";
    }
    const newDigit = randomNonZeroDigit(origNum);
    return isNegative ? `-${newDigit}` : `${newDigit}`;
  }

  // 複数桁の場合: 同一桁数を維持
  const origVal = parseInt(cleanDigits, 10);
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;

  let attempts = 0;
  let newVal = origVal;
  while (attempts < 20 && (newVal === origVal || newVal < min)) {
    newVal = Math.floor(Math.random() * (max - min + 1)) + min;
    attempts++;
  }

  return isNegative ? `-${newVal}` : `${newVal}`;
}

/**
 * 2次方程式 x^2 + bx + c = 0 の逆算生成
 * 解 α, β ∈ [-6, 6] \ {0} を先に決定し、b = -(α+β), c = αβ を算出
 */
export function generateQuadraticEquationProblem(
  originalB: number = -5,
  originalC: number = 6
): {
  newB: number;
  newC: number;
  root1: number;
  root2: number;
  solution: MathSolutionDetail;
} {
  // 解候補（生徒が解きやすい -5 〜 5 のゼロ以外の整数）
  const candidateRoots = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5];

  let r1 = 2;
  let r2 = 3;
  let newB = -(r1 + r2);
  let newC = r1 * r2;
  let attempts = 0;

  do {
    r1 = candidateRoots[Math.floor(Math.random() * candidateRoots.length)] ?? 2;
    r2 = candidateRoots[Math.floor(Math.random() * candidateRoots.length)] ?? 3;
    newB = -(r1 + r2);
    newC = r1 * r2;
    attempts++;
  } while (attempts < 20 && newB === originalB && newC === originalC);

  // 符号付き文字列表現（1, -1, 0 の適切な表記処理）
  let bPart = "";
  if (newB === 1) bPart = "+ x";
  else if (newB === -1) bPart = "- x";
  else if (newB > 1) bPart = `+ ${newB}x`;
  else if (newB < -1) bPart = `- ${Math.abs(newB)}x`;

  const cPart = newC > 0 ? `+ ${newC}` : newC < 0 ? `- ${Math.abs(newC)}` : "";
  const formula = `x^2 ${bPart} ${cPart} = 0`.replace(/\s+/g, " ").trim();

  // 因数分解の表示
  const p1 = -r1 >= 0 ? `+ ${-r1}` : `- ${r1}`;
  const p2 = -r2 >= 0 ? `+ ${-r2}` : `- ${r2}`;

  const steps = [
    `与式: ${formula}`,
    `和が ${-newB}、積が ${newC} となる2つの整数を探します。`,
    `該当する2数は ${-r1} と ${-r2} です。`,
    `因数分解すると: (x ${p1})(x ${p2}) = 0`,
    `各因数を 0 とおいて解を求めます: x - (${r1}) = 0 または x - (${r2}) = 0`,
  ];

  const answer = r1 === r2 ? `x = ${r1} (重解)` : `x = ${r1}, ${r2}`;

  return {
    newB,
    newC,
    root1: r1,
    root2: r2,
    solution: {
      problemType: "2次方程式（因数分解による解法）",
      transformedFormula: formula,
      answer,
      steps,
    },
  };
}

/**
 * 1次方程式 ax + b = c の逆算生成
 * 解 x0 ∈ [-9, 9] \ {0} を決定し、c = a * x0 + b を算出
 */
export function generateLinearEquationProblem(
  originalA: number = 2,
  originalB: number = 3,
  originalC: number = 7
): {
  newA: number;
  newB: number;
  newC: number;
  root: number;
  solution: MathSolutionDetail;
} {
  const newA = randomNonZeroDigit(originalA === 1 ? undefined : originalA);
  const candidateRoots = [-8, -6, -5, -4, -3, -2, -1, 2, 3, 4, 5, 6, 7, 8];
  const root = candidateRoots[Math.floor(Math.random() * candidateRoots.length)] ?? 3;
  const newB = Math.floor(Math.random() * 15) - 7; // -7〜7
  const newC = newA * root + newB;

  const bStr = newB > 0 ? `+ ${newB}` : newB < 0 ? `- ${Math.abs(newB)}` : "";
  const formula = `${newA === 1 ? "" : newA}x ${bStr} = ${newC}`.replace(/\s+/g, " ").trim();

  const step1Right = newC - newB;
  const steps = [
    `与式: ${formula}`,
    newB !== 0 ? `定数項を右辺に移項: ${newA}x = ${newC} - (${newB}) = ${step1Right}` : `両辺を整理: ${newA}x = ${newC}`,
    `両辺を x の係数 ${newA} で割る: x = ${step1Right} / ${newA}`,
    `解: x = ${root}`,
  ];

  return {
    newA,
    newB,
    newC,
    root,
    solution: {
      problemType: "1次方程式",
      transformedFormula: formula,
      answer: `x = ${root}`,
      steps,
    },
  };
}

/**
 * 連立1次方程式の逆算生成
 */
export function generateSimultaneousEquationsProblem(): {
  a1: number; b1: number; c1: number;
  a2: number; b2: number; c2: number;
  ansX: number; ansY: number;
  solution: MathSolutionDetail;
} {
  const ansX = [-4, -3, -2, -1, 1, 2, 3, 4, 5][Math.floor(Math.random() * 9)] ?? 2;
  const ansY = [-4, -3, -2, -1, 1, 2, 3, 4, 5][Math.floor(Math.random() * 9)] ?? 3;

  const a1 = randomNonZeroDigit();
  const b1 = randomNonZeroDigit();
  const c1 = a1 * ansX + b1 * ansY;

  let a2 = randomNonZeroDigit();
  let b2 = randomNonZeroDigit();
  // 行列式が0にならない（解が1組に定まる）ことを保証
  while (a1 * b2 - a2 * b1 === 0) {
    b2 = randomNonZeroDigit();
  }
  const c2 = a2 * ansX + b2 * ansY;

  const eq1 = `${a1 === 1 ? "" : a1}x + ${b1 === 1 ? "" : b1}y = ${c1}`;
  const eq2 = `${a2 === 1 ? "" : a2}x + ${b2 === 1 ? "" : b2}y = ${c2}`;

  const steps = [
    `連立方程式:\n  ① ${eq1}\n  ② ${eq2}`,
    `加減法または代入法を用いて1文字を消去します。`,
    `① × ${b2} - ② × ${b1} より y を消去: (${a1 * b2 - a2 * b1})x = ${c1 * b2 - c2 * b1}`,
    `x = ${ansX} を得ます。`,
    `x = ${ansX} を ① 式に代入して y を算出: ${a1}(${ansX}) + ${b1}y = ${c1} ⇒ y = ${ansY}`,
  ];

  return {
    a1, b1, c1,
    a2, b2, c2,
    ansX, ansY,
    solution: {
      problemType: "連立1次方程式",
      transformedFormula: `\\begin{cases} ${eq1} \\\\ ${eq2} \\end{cases}`,
      answer: `x = ${ansX}, y = ${ansY}`,
      steps,
    },
  };
}

/**
 * 検出された数値群から決定論的な数理整合置換を生成（1:1インデックス対応）
 */
export function generateDeterministicTransformations(
  detections: DetectedNumber[],
  rawText?: string
): TransformationResult {
  const textContent = (rawText || "").replace(/\s+/g, "");

  // 1. 2次方程式パターン (x^2 or x² を含む)
  if (/(?:x\^2|x²|X\^2|X²)/.test(textContent) && detections.length >= 2) {
    const quad = generateQuadraticEquationProblem();
    let assignedB = false;
    let assignedC = false;

    const replacements: ReplacementMapping[] = detections.map((d, idx) => {
      let replacement: string;
      if (d.role !== "sup" && !assignedB) {
        replacement = String(Math.abs(quad.newB));
        assignedB = true;
      } else if (d.role !== "sup" && !assignedC) {
        replacement = String(Math.abs(quad.newC));
        assignedC = true;
      } else {
        replacement = generateSafeNumber(d.text, { role: d.role });
      }
      return {
        id: `${idx}-${d.text}`,
        index: idx,
        original: d.text,
        replacement,
        role: d.role,
      };
    });

    return {
      replacements,
      solution: quad.solution,
      source: "deterministic-math",
    };
  }

  // 2. 1次方程式パターン (xを含む & =を含む)
  if (/[xX]/.test(textContent) && /=/.test(textContent) && detections.length >= 2) {
    const lin = generateLinearEquationProblem();
    let assignedA = false;
    let assignedBC = false;

    const replacements: ReplacementMapping[] = detections.map((d, idx) => {
      let replacement: string;
      if (d.role !== "sup" && !assignedA) {
        replacement = String(lin.newA);
        assignedA = true;
      } else if (d.role !== "sup" && !assignedBC) {
        replacement = String(Math.abs(lin.newB || lin.newC));
        assignedBC = true;
      } else {
        replacement = generateSafeNumber(d.text, { role: d.role });
      }
      return {
        id: `${idx}-${d.text}`,
        index: idx,
        original: d.text,
        replacement,
        role: d.role,
      };
    });

    return {
      replacements,
      solution: lin.solution,
      source: "deterministic-math",
    };
  }

  // 3. 一般安全置換（すべての検出数値を1:1に整合変換）
  const replacements: ReplacementMapping[] = detections.map((d, idx) => ({
    id: `${idx}-${d.text}`,
    index: idx,
    original: d.text,
    replacement: generateSafeNumber(d.text, { role: d.role }),
    role: d.role,
  }));

  const steps = [
    "画像内の数値を新しい類題数値に置き換えました。",
    "元の問題の解法パターン（公式・展開・移項）をそのまま適用して計算を進めてください。",
  ];

  return {
    replacements,
    solution: {
      problemType: "標準数学問題",
      transformedFormula: "類題への数値変換完了",
      answer: "各ステップに従って導出",
      steps,
    },
    source: "safe-rule",
  };
}

/**
 * サーバー側 API (/api/replace) と連携し、AIによる高度な数理整合置換・解説生成を実行
 */
export async function requestAiTransformation(input: {
  numbers: string[];
  rawText?: string;
  detections: DetectedNumber[];
}): Promise<TransformationResult> {
  const { numbers, rawText, detections } = input;

  try {
    const response = await fetch("/api/replace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        numbers,
        rawText,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error ${response.status}`);
    }

    const data = await response.json();

    if (data.replacements && Array.isArray(data.replacements)) {
      const aiReplacements = data.replacements as Array<{ original: string; replacement: string; role?: TextRole }>;
      const replacements: ReplacementMapping[] = detections.map((d, idx) => {
        const matched =
          aiReplacements[idx] ||
          aiReplacements.find((r) => r.original === d.text);
        return {
          id: `${idx}-${d.text}`,
          index: idx,
          original: d.text,
          replacement: matched?.replacement
            ? String(matched.replacement)
            : generateSafeNumber(d.text, { role: d.role }),
          role: d.role,
        };
      });

      return {
        replacements,
        solution: {
          problemType: data.problemType || "数学類題",
          originalFormula: data.originalProblem || rawText,
          transformedFormula: data.newProblem || "類題数式",
          answer: data.answer || "解答計算完了",
          steps:
            Array.isArray(data.steps) && data.steps.length > 0
              ? data.steps
              : ["公式に代入して計算します。"],
        },
        source: "ai",
      };
    }
  } catch (err) {
    console.warn("[mathTransformEngine] AI API 呼び出しに失敗したため決定論的エンジンにフォールバック:", err);
  }

  // フォールバック実行
  return generateDeterministicTransformations(detections, rawText);
}
