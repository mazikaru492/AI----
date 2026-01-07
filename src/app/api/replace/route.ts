import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_MODEL_LIST } from "@/lib/gemini";

export const runtime = "nodejs";

interface ReplacementRequest {
  numbers: string[];
}

interface ReplacementResult {
  original: string;
  replacement: string;
}

function getApiKey(): string {
  const key = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GOOGLE_GEMINI_API_KEY is not set");
  }
  return key;
}

function parseReplacementResult(text: string): ReplacementResult[] {
  // JSONを抽出
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("JSON array not found in response");
  }

  const parsed = JSON.parse(jsonMatch[0]) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Response is not an array");
  }

  return parsed.map((item) => {
    if (
      typeof item !== "object" ||
      !item ||
      typeof (item as Record<string, unknown>).original !== "string" ||
      typeof (item as Record<string, unknown>).replacement !== "string"
    ) {
      throw new Error("Invalid replacement item structure");
    }
    return item as ReplacementResult;
  });
}

const SYSTEM_PROMPT = `あなたは数学問題の類題作成AIです。

与えられた数値リストに対して、以下のルールで新しい数値を生成してください：
1. 答えが「きれいな整数」または「簡単な分数」になるよう調整
2. 元の数値と同じ桁数を維持
3. 計算がしやすい数値を選ぶ

JSON形式で返してください（余計な説明は不要）:
[
  { "original": "元の数値", "replacement": "新しい数値" },
  ...
]`;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ReplacementRequest;
    const { numbers } = body;

    if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
      return NextResponse.json(
        { error: "numbers array is required" },
        { status: 400 }
      );
    }

    const uniqueNumbers = [...new Set(numbers)];

    const apiKey = getApiKey();
    const genAI = new GoogleGenerativeAI(apiKey);

    // Try each model
    for (const modelName of GEMINI_MODEL_LIST) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: SYSTEM_PROMPT,
        });

        const prompt = `以下の数値を、類題用の新しい数値に置き換えてください:\n\n${uniqueNumbers.join(", ")}\n\nJSON形式で返してください。`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const replacements = parseReplacementResult(text);

        return NextResponse.json(replacements);
      } catch (e) {
        console.log(`[Replace API] Failed with ${modelName}:`, e);
        continue;
      }
    }

    return NextResponse.json(
      { error: "All models failed" },
      { status: 500 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Replace API Error]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
