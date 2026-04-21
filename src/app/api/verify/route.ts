import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_MODEL_LIST } from "@/lib/gemini";
import { getFallbackDecision } from "@/lib/modelFallback";

export const runtime = "nodejs";

const VERIFY_CACHE_TTL_MS = 5 * 60 * 1000;
const verifyResultCache = new Map<string, { expiresAt: number; value: VerifyResult }>();

interface VerifyRequest {
  imageBase64: string;
  mimeType: string;
}

interface ProblemVerification {
  id: number;
  expression: string;
  isSolvable: boolean;
  issue: string | null;
  suggestedFix: string | null;
}

interface VerifyResult {
  problems: ProblemVerification[];
  allValid: boolean;
}

function getApiKey(): string {
  const key = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GOOGLE_GEMINI_API_KEY is not set");
  }
  return key;
}

const VERIFICATION_PROMPT = `# Role
あなたは数学教師AIです。画像内の数学問題を分析し、各問題が数学的に解けるかを検証してください。

# Task
1. 画像から全ての数学問題を認識
2. 各問題について以下を判定:
   - 計算可能か（0で割る、負の平方根など不可能な操作がないか）
   - 期待される結果が整数または単純な分数になるか
   - 小学生〜中学生レベルで解けるか

# Output Format (JSON only, no markdown)
{
  "problems": [
    {
      "id": 1,
      "expression": "認識した式",
      "isSolvable": true,
      "issue": null,
      "suggestedFix": null
    }
  ],
  "allValid": true
}

# Important
- JSONのみを返してください（マークダウンのコードブロックは不要）
- 問題が見つからない場合は空の配列を返してください
- 全ての問題が解ける場合は allValid: true にしてください`;

function parseVerificationResult(text: string): VerifyResult {
  // JSONを抽出
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("JSON object not found in response");
  }

  const parsed = JSON.parse(jsonMatch[0]) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Response is not an object");
  }

  const result = parsed as VerifyResult;
  if (!Array.isArray(result.problems)) {
    result.problems = [];
  }

  return result;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VerifyRequest;
    const { imageBase64, mimeType } = body;

    if (!imageBase64) {
      return NextResponse.json(
        { error: "imageBase64 is required" },
        { status: 400 }
      );
    }

    const apiKey = getApiKey();
    const genAI = new GoogleGenerativeAI(apiKey);
    const cacheKey = `${mimeType || "image/png"}:${imageBase64.length}:${imageBase64.slice(0, 256)}`;
    const cached = verifyResultCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({ ...cached.value, cached: true });
    }

    // Try each model
    for (const modelName of GEMINI_MODEL_LIST) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
        });

        const result = await model.generateContent([
          {
            inlineData: {
              mimeType: mimeType || "image/png",
              data: imageBase64,
            },
          },
          VERIFICATION_PROMPT,
        ]);

        const text = result.response.text();
        console.log("[Verify API] Response:", text);

        const verification = parseVerificationResult(text);
        verifyResultCache.set(cacheKey, {
          expiresAt: Date.now() + VERIFY_CACHE_TTL_MS,
          value: verification,
        });
        return NextResponse.json(verification);
      } catch (e) {
        console.log(`[Verify API] Failed with ${modelName}:`, e);
        const decision = getFallbackDecision(e);
        if (decision.shouldFallback) {
          continue;
        }
        throw e;
      }
    }

    return NextResponse.json(
      { error: "All models failed" },
      { status: 500 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Verify API Error]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
