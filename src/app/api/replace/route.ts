import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_MODEL_LIST } from "@/lib/gemini";
import { getFallbackDecision } from "@/lib/modelFallback";

export const runtime = "nodejs";

const REPLACE_CACHE_TTL_MS = 30 * 60 * 1000;
const replaceResultCache = new Map<string, { expiresAt: number; value: unknown }>();

interface ReplacementRequest {
  numbers: string[];
  rawText?: string;
}

interface ReplacementItem {
  original: string;
  replacement: string;
  role?: string;
}

interface EnhancedReplaceResponse {
  replacements: ReplacementItem[];
  problemType?: string;
  originalProblem?: string;
  newProblem?: string;
  answer?: string;
  steps?: string[];
}

function getApiKey(): string {
  const key = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GOOGLE_GEMINI_API_KEY is not set");
  }
  return key;
}

function parseAiResponse(text: string): EnhancedReplaceResponse {
  // 1. JSONオブジェクトまたは配列を抽出
  const cleaned = text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/i, "$1").trim();

  // オブジェクト形式 { replacements: [...], answer: "...", ... } のパースを試行
  try {
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      const parsed = JSON.parse(objMatch[0]) as Record<string, unknown>;
      if (Array.isArray(parsed.replacements)) {
        return {
          replacements: parsed.replacements.map((item: Record<string, unknown>) => ({
            original: String(item.original ?? ""),
            replacement: String(item.replacement ?? ""),
            role: item.role ? String(item.role) : undefined,
          })),
          problemType: typeof parsed.problemType === "string" ? parsed.problemType : "数学問題",
          originalProblem: typeof parsed.originalProblem === "string" ? parsed.originalProblem : undefined,
          newProblem: typeof parsed.newProblem === "string" ? parsed.newProblem : undefined,
          answer: typeof parsed.answer === "string" ? parsed.answer : "計算完了",
          steps: Array.isArray(parsed.steps) ? parsed.steps.map((s) => String(s)) : [],
        };
      }
    }
  } catch (e) {
    console.warn("[parseAiResponse] Object parse fallback:", e);
  }

  // 配列形式 [...] のパースを試行（後方互換）
  try {
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      const parsedArr = JSON.parse(arrMatch[0]) as Array<Record<string, unknown>>;
      if (Array.isArray(parsedArr)) {
        const replacements = parsedArr.map((item) => ({
          original: String(item.original ?? ""),
          replacement: String(item.replacement ?? ""),
        }));
        return {
          replacements,
          problemType: "数学問題",
          answer: "解法ステップに従って算出",
          steps: ["公式および式変形を用いて解を導出します。"],
        };
      }
    }
  } catch (e) {
    console.warn("[parseAiResponse] Array parse fallback:", e);
  }

  throw new Error("AIレスポンスのJSON構造解析に失敗しました。");
}

const SYSTEM_PROMPT = `あなたは世界最高峰の数学教育AI兼、入試問題作成エキスパートです。
与えられた数学問題（または検出された数値リスト）をもとに、数学的に破綻のない「類題の数値セット」と「模範解答・ステップ解説」を生成してください。

【厳格ルール】
1. 数理的整合性（最重要）:
   - 2次方程式や因数分解問題の場合、判別式 D ≧ 0 かつ因数分解可能（きれいな整数解）になるよう係数を調整する。
   - 1次方程式・連立方程式は整数またはシンプルな既約分数の解になるよう逆算する。
   - 変数の係数を 0 にして次数を落とさない（例: 2x を 0x にしない）。
   - 指数（x^2 の 2 など）や円周率・自然対数の底等の定数は絶対に変更しない。
2. 桁数の維持: 元の数値とおおむね同じ桁数・難易度を保つ。
3. 出力形式: 必ず以下のJSONオブジェクト形式のみを出力してください（Markdownのコードフェンスや余計な解説文は不要）。

{
  "problemType": "問題の種別（例: 2次方程式の解法, 1次関数の交点, 因数分解）",
  "originalProblem": "元の問題・数式",
  "newProblem": "数値を置換した新しい問題・数式",
  "replacements": [
    { "original": "元の数値1", "replacement": "新しい数値1" },
    { "original": "元の数値2", "replacement": "新しい数値2" }
  ],
  "answer": "最終的な解答（例: x = 2, 5 または x = 3, y = -1）",
  "steps": [
    "ステップ1の説明（与式の整理・因数分解など）",
    "ステップ2の説明（途中計算）",
    "ステップ3の説明（解の導出）"
  ]
}`;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ReplacementRequest;
    const { numbers, rawText } = body;

    if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
      return NextResponse.json(
        { error: "numbers array is required" },
        { status: 400 }
      );
    }

    const uniqueNumbers = [...new Set(numbers)];
    const cacheKey = `${uniqueNumbers.slice().sort().join("|")}_${(rawText || "").slice(0, 100)}`;
    const cached = replaceResultCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.value);
    }

    const apiKey = getApiKey();
    const genAI = new GoogleGenerativeAI(apiKey);

    const userPrompt = `以下の数学問題と数値リストから、解がきれいに求まる類題数値、模範解答、ステップ解説を生成してください。\n\n【認識された問題テキスト】:\n${rawText || "なし"}\n\n【置換対象の数値リスト】:\n${uniqueNumbers.join(", ")}\n\nJSON形式で返してください。`;

    for (const modelName of GEMINI_MODEL_LIST) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: SYSTEM_PROMPT,
        });

        const result = await model.generateContent(userPrompt);
        const text = result.response.text();
        const parsed = parseAiResponse(text);

        replaceResultCache.set(cacheKey, {
          expiresAt: Date.now() + REPLACE_CACHE_TTL_MS,
          value: parsed,
        });

        return NextResponse.json(parsed);
      } catch (e) {
        console.log(`[Replace API] Failed with ${modelName}:`, e);
        const decision = getFallbackDecision(e);
        if (decision.shouldFallback) {
          continue;
        }
        throw e;
      }
    }

    return NextResponse.json(
      { error: "All Gemini models failed" },
      { status: 500 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Replace API Error]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

