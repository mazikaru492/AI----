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

/**
 * 検出された数値（ピクセル座標付き）
 */
interface DetectedNumber {
  text: string;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
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

/**
 * Micro-Detection プロンプト
 * 分数、指数、添字などの小さな数字も検出
 */
const DETECTION_PROMPT = `You are a Precision Micro-Text Digit Scanner.

TASK: Detect the EXACT bounding box of EVERY numeric digit (0-9) in this image.
You MUST find ALL integers, including very small ones ("Micro-Text").

CRITICAL - SMALL DIGIT DETECTION:
You MUST detect these commonly missed small digits:
1. **Exponents/Superscripts** - e.g., the "2" in x², the "3" in 2³
2. **Fractions** - BOTH numerator AND denominator digits separately
3. **Indices/Subscripts** - e.g., the "1" in x₁, the "n" subscripts
4. **Coefficients** - small numbers before variables

RULES:
- ONLY detect digits: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9
- IGNORE all letters (x, y, a, b, A-Z), symbols (+, -, =, ÷, ×), and markers (①②③)
- Each detection should FULLY ENCLOSE the digit's ink footprint
- Multi-digit numbers (e.g., "12") should be detected as ONE box
- For fractions: detect numerator digits and denominator digits SEPARATELY
- Return PRECISE coordinates, especially for small digits

OUTPUT FORMAT (raw JSON only, no markdown):
{
  "numbers": [
    {"text": "5", "ymin": 120.5, "xmin": 80.2, "ymax": 145.8, "xmax": 95.1},
    {"text": "2", "ymin": 50.0, "xmin": 200.0, "ymax": 65.0, "xmax": 210.0}
  ]
}

COORDINATE PRECISION:
- Scale: 0-1000 (0 = top/left edge, 1000 = bottom/right edge)
- Decimal values are allowed for higher precision
- ymin: top edge, xmin: left edge, ymax: bottom edge, xmax: right edge
- For tiny digits, ensure the box tightly fits the ink footprint

Return ONLY the JSON. No explanations.`;


/**
 * レスポンスをパースしてピクセル座標に変換
 */
function parseDetectionResult(
  text: string,
  imageWidth: number,
  imageHeight: number
): DetectResult {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log("[Detect API] No JSON found");
      return { numbers: [], success: false };
    }

    const parsed = JSON.parse(jsonMatch[0]) as { numbers?: unknown[] };
    if (!parsed.numbers || !Array.isArray(parsed.numbers)) {
      return { numbers: [], success: false };
    }

    const numbers: DetectedNumber[] = parsed.numbers.map((item: unknown) => {
      const n = item as {
        text: string;
        ymin: number;
        xmin: number;
        ymax: number;
        xmax: number;
      };

      // 0-1000 正規化座標 → ピクセル座標
      const x = Math.round((n.xmin / 1000) * imageWidth);
      const y = Math.round((n.ymin / 1000) * imageHeight);
      const width = Math.round(((n.xmax - n.xmin) / 1000) * imageWidth);
      const height = Math.round(((n.ymax - n.ymin) / 1000) * imageHeight);

      return {
        text: String(n.text),
        bbox: { x, y, width, height },
      };
    });

    return { numbers, success: true };
  } catch (e) {
    console.error("[Detect API] Parse error:", e);
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

    for (const modelName of GEMINI_MODEL_LIST) {
      try {
        console.log(`[Detect API] Trying: ${modelName}`);

        const model = genAI.getGenerativeModel({ model: modelName });

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
        console.log("[Detect API] Response:", text.substring(0, 300));

        const detection = parseDetectionResult(text, imageWidth, imageHeight);

        if (detection.success && detection.numbers.length > 0) {
          console.log(`[Detect API] Found ${detection.numbers.length} numbers`);
          return NextResponse.json(detection);
        }

        console.log("[Detect API] No numbers, trying next model...");
      } catch (e) {
        console.log(`[Detect API] ${modelName} failed:`, e);
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
