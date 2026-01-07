import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_MODEL_LIST } from "@/lib/gemini";

export const runtime = "nodejs";

interface DetectRequest {
  imageBase64: string;
  mimeType: string;
  imageWidth: number;
  imageHeight: number;
}

interface DetectedNumber {
  text: string;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
  confidence: number;
}

interface DetectResult {
  numbers: DetectedNumber[];
  success: boolean;
}

function getApiKey(): string {
  const key = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GOOGLE_GEMINI_API_KEY is not set");
  }
  return key;
}

const DETECTION_PROMPT = `# Task
あなたは画像内の数値を検出するAIです。この数学問題画像から全ての数値を検出し、その位置（バウンディングボックス座標）を返してください。

# Instructions
1. 画像内の全ての数値（整数、小数）を見つける
2. 各数値の位置を画像のピクセル座標で推定
3. 座標は画像の左上を(0,0)として推定

# Output Format (JSON only, no markdown)
{
  "numbers": [
    {
      "text": "検出した数値の文字列",
      "bbox": {
        "x0": "左端のX座標（0-1の比率）",
        "y0": "上端のY座標（0-1の比率）",
        "x1": "右端のX座標（0-1の比率）",
        "y1": "下端のY座標（0-1の比率）"
      },
      "confidence": 0.9
    }
  ]
}

# Important
- JSONのみを返してください（マークダウンのコードブロックは不要）
- 座標は0から1の比率で表現（例: 画像幅の半分なら0.5）
- 問題番号（①②など）は除外
- 変数（x, y, a, b）は除外、数値のみ検出
- 小さすぎる数値（1桁の指数など）も可能な限り検出`;

function parseDetectionResult(text: string, imageWidth: number, imageHeight: number): DetectResult {
  try {
    // JSONを抽出
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log('[Detect API] No JSON found in response');
      return { numbers: [], success: false };
    }

    const parsed = JSON.parse(jsonMatch[0]) as { numbers?: unknown[] };
    if (!parsed.numbers || !Array.isArray(parsed.numbers)) {
      return { numbers: [], success: false };
    }

    const numbers: DetectedNumber[] = parsed.numbers.map((item: unknown) => {
      const n = item as {
        text: string;
        bbox: { x0: number; y0: number; x1: number; y1: number };
        confidence?: number;
      };

      // 比率をピクセル座標に変換
      return {
        text: String(n.text),
        bbox: {
          x0: Math.round(n.bbox.x0 * imageWidth),
          y0: Math.round(n.bbox.y0 * imageHeight),
          x1: Math.round(n.bbox.x1 * imageWidth),
          y1: Math.round(n.bbox.y1 * imageHeight),
        },
        confidence: n.confidence || 0.8,
      };
    });

    return { numbers, success: true };
  } catch (e) {
    console.error('[Detect API] Parse error:', e);
    return { numbers: [], success: false };
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as DetectRequest;
    const { imageBase64, mimeType, imageWidth, imageHeight } = body;

    if (!imageBase64) {
      return NextResponse.json(
        { error: "imageBase64 is required" },
        { status: 400 }
      );
    }

    const apiKey = getApiKey();
    const genAI = new GoogleGenerativeAI(apiKey);

    // Try each model
    for (const modelName of GEMINI_MODEL_LIST) {
      try {
        console.log(`[Detect API] Trying model: ${modelName}`);

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
          DETECTION_PROMPT,
        ]);

        const text = result.response.text();
        console.log('[Detect API] Raw response:', text.substring(0, 500));

        const detection = parseDetectionResult(text, imageWidth, imageHeight);

        if (detection.success && detection.numbers.length > 0) {
          console.log(`[Detect API] Found ${detection.numbers.length} numbers`);
          return NextResponse.json(detection);
        }

        console.log('[Detect API] No numbers found, trying next model...');
      } catch (e) {
        console.log(`[Detect API] Failed with ${modelName}:`, e);
        continue;
      }
    }

    return NextResponse.json(
      { numbers: [], success: false, error: "No numbers detected" },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Detect API Error]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
