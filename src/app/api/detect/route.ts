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
 * 文字ごとのバウンディングボックス（カーニング再現用）
 */
interface CharBbox {
  char: string;
  xmin: number;
  xmax: number;
}

/**
 * フォントスタイル分類
 */
type FontStyle = 'maru-gothic' | 'gothic' | 'mincho' | 'handwritten';

/**
 * 文字の役割（上付き/下付き/通常）
 */
type TextRole = 'base' | 'sup' | 'sub';

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
  /** テキストのベースライン位置（ピクセル） */
  baselineY?: number;
  /** 推定されたフォントスタイル */
  fontStyle?: FontStyle;
  /** 文字の役割（通常/上付き/下付き） */
  role?: TextRole;
  /** 親文字（上付き・下付きの場合のみ） */
  parentChar?: string;
  /** 各文字の個別バウンディングボックス */
  charBboxes?: CharBbox[];
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
 * + ベースライン位置、フォントスタイル、文字ごとのbbox、役割(role)
 */
const DETECTION_PROMPT = `You are a Precision Micro-Text Digit Scanner with Math Expression Analysis.

TASK: Detect the EXACT bounding box of EVERY numeric digit (0-9) in this image.
You MUST find ALL integers, including very small ones ("Micro-Text").

CRITICAL - ROLE CLASSIFICATION:
For each detected number, you MUST classify its role:
1. **"base"** - Normal text on the main baseline (e.g., coefficients like "6" in "6x")
2. **"sup"** - Superscript/Exponent (e.g., the "2" in x², positioned ABOVE the baseline, smaller font)
3. **"sub"** - Subscript/Index (e.g., the "1" in x₁, positioned BELOW the baseline, smaller font)

DETECTION TARGETS:
- Exponents/Superscripts - the "2" in x², "3" in 2³ (role: "sup")
- Subscripts/Indices - the "1" in x₁ (role: "sub")
- Fractions - numerator and denominator separately
- Coefficients - numbers before variables (role: "base")

RULES:
- ONLY detect digits: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9
- IGNORE all letters (x, y, a, b, A-Z), symbols (+, -, =, ÷, ×), and markers (①②③)
- Each detection should FULLY ENCLOSE the digit's ink footprint
- Multi-digit numbers (e.g., "12") should be detected as ONE box
- Return PRECISE coordinates, especially for small digits

OUTPUT FORMAT (raw JSON only, no markdown):
{
  "numbers": [
    {
      "text": "6",
      "role": "base",
      "ymin": 100.0,
      "xmin": 50.0,
      "ymax": 130.0,
      "xmax": 70.0,
      "baselineY": 126.0,
      "fontStyle": "gothic"
    },
    {
      "text": "2",
      "role": "sup",
      "parentChar": "x",
      "ymin": 95.0,
      "xmin": 120.0,
      "ymax": 110.0,
      "xmax": 135.0,
      "baselineY": 108.0,
      "fontStyle": "gothic"
    },
    {
      "text": "1",
      "role": "sub",
      "parentChar": "x",
      "ymin": 135.0,
      "xmin": 200.0,
      "ymax": 150.0,
      "xmax": 215.0,
      "baselineY": 148.0,
      "fontStyle": "gothic"
    }
  ]
}

FIELD DESCRIPTIONS:
- **role**: REQUIRED. One of "base", "sup", or "sub"
  - "base": Normal baseline text
  - "sup": Superscript (smaller, positioned above parent character)
  - "sub": Subscript (smaller, positioned below parent character)
- **parentChar**: For "sup" or "sub" only. The adjacent character this number is attached to (e.g., "x" for x²)
- **baselineY**: Y-coordinate of text baseline (~85-90% from ymin to ymax)
- **fontStyle**: "maru-gothic" | "gothic" | "mincho" | "handwritten"
- **charBboxes**: For multi-digit numbers, each character's xmin/xmax

COORDINATE PRECISION:
- Scale: 0-1000 (0 = top/left edge, 1000 = bottom/right edge)
- Decimal values allowed for precision
- For tiny superscript/subscript digits, ensure tight bounding boxes

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
        baselineY?: number;
        fontStyle?: string;
        role?: string;
        parentChar?: string;
        charBboxes?: Array<{ char: string; xmin: number; xmax: number }>;
      };

      // 0-1000 正規化座標 → ピクセル座標
      const x = Math.round((n.xmin / 1000) * imageWidth);
      const y = Math.round((n.ymin / 1000) * imageHeight);
      const width = Math.round(((n.xmax - n.xmin) / 1000) * imageWidth);
      const height = Math.round(((n.ymax - n.ymin) / 1000) * imageHeight);

      // ベースライン位置のピクセル座標変換
      const baselineY = n.baselineY
        ? Math.round((n.baselineY / 1000) * imageHeight)
        : undefined;

      // フォントスタイルの検証
      const validFontStyles = ['maru-gothic', 'gothic', 'mincho', 'handwritten'] as const;
      const fontStyle = n.fontStyle && validFontStyles.includes(n.fontStyle as typeof validFontStyles[number])
        ? (n.fontStyle as FontStyle)
        : undefined;

      // 文字役割の検証
      const validRoles = ['base', 'sup', 'sub'] as const;
      const role = n.role && validRoles.includes(n.role as typeof validRoles[number])
        ? (n.role as TextRole)
        : 'base'; // デフォルトはbase

      // 親文字（上付き・下付きの場合のみ）
      const parentChar = (role === 'sup' || role === 'sub') && n.parentChar
        ? n.parentChar
        : undefined;

      // 文字ごとのbboxをピクセル座標に変換
      const charBboxes = n.charBboxes?.map(cb => ({
        char: cb.char,
        xmin: Math.round((cb.xmin / 1000) * imageWidth),
        xmax: Math.round((cb.xmax / 1000) * imageWidth),
      }));

      return {
        text: String(n.text),
        bbox: { x, y, width, height },
        baselineY,
        fontStyle,
        role,
        parentChar,
        charBboxes,
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
