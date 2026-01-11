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
 * 中学〜高校数学（数III）全範囲対応
 * 分数、根号、Σ、∫、lim、行列などの数式構造を検出
 */
const DETECTION_PROMPT = `You are a Precision Math Expression Analyzer for Japanese middle/high school math.

TASK: Detect ALL numeric digits (0-9) in this image and classify their mathematical role.

ROLE CLASSIFICATION (Required for each number):

**Basic Roles:**
- "base": Normal baseline text (coefficients: "2" in "2x", answers: "5")
- "sup": Superscript/Exponent (the "2" in x², "3" in 2³)
- "sub": Subscript/Index (the "1" in x₁, "n" in aₙ)

**Fraction Roles:**
- "fraction-num": Numerator of a fraction (the "2" in (2/3))
- "fraction-den": Denominator of a fraction (the "3" in (2/3))

**Big Operator Roles:**
- "sum-lower": Lower limit of Σ (the "1" in Σ_{k=1}^n)
- "sum-upper": Upper limit of Σ (the "n" in Σ_{k=1}^n)
- "int-lower": Lower limit of ∫ (the "0" in ∫₀¹)
- "int-upper": Upper limit of ∫ (the "1" in ∫₀¹)
- "lim-sub": Limit subscript (the "0" in lim_{x→0})

**Other Roles:**
- "sqrt-content": Number inside √ (the "2" in √2)

DETECTION TARGETS:
- Coefficients: 2x, 3ab, -5y
- Exponents: x², 2³, aⁿ
- Subscripts: x₁, aₙ, log₂
- Fractions: sin2x/x, (a+b)/2
- Limits: lim_{x→0}, lim_{n→∞}
- Summations: Σ_{k=1}^{n}, Σ_{i=0}^{10}
- Integrals: ∫₀¹, ∫ₐᵇ
- Square roots: √2, √(x+1)
- Trigonometry arguments: sin30°, cos2θ

RULES:
- ONLY detect digits: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9
- IGNORE letters (x, y, sin, cos), symbols (+, -, =), markers (①②③)
- Multi-digit numbers as ONE box (e.g., "12", "100")
- Precise coordinates, especially for small digits

OUTPUT FORMAT (raw JSON only):
{
  "numbers": [
    {
      "text": "2",
      "role": "base",
      "ymin": 100.0, "xmin": 50.0, "ymax": 130.0, "xmax": 70.0,
      "baselineY": 126.0,
      "fontStyle": "gothic"
    },
    {
      "text": "2",
      "role": "sup",
      "parentChar": "x",
      "ymin": 95.0, "xmin": 120.0, "ymax": 110.0, "xmax": 135.0,
      "baselineY": 108.0,
      "fontStyle": "gothic"
    },
    {
      "text": "0",
      "role": "lim-sub",
      "groupId": "lim1",
      "ymin": 150.0, "xmin": 80.0, "ymax": 165.0, "xmax": 95.0,
      "baselineY": 162.0,
      "fontStyle": "gothic"
    },
    {
      "text": "2",
      "role": "fraction-num",
      "groupId": "frac1",
      "ymin": 50.0, "xmin": 100.0, "ymax": 70.0, "xmax": 120.0,
      "baselineY": 66.0,
      "fontStyle": "gothic"
    }
  ]
}

FIELDS:
- **role**: REQUIRED. See role list above
- **parentChar**: For sup/sub only (e.g., "x" for x²)
- **groupId**: For related tokens (e.g., same fraction, same Σ)
- **baselineY**: Y-coordinate of text baseline
- **fontStyle**: "maru-gothic" | "gothic" | "mincho" | "handwritten"

COORDINATES: Scale 0-1000. Ensure tight bounding boxes for small digits.

Return ONLY JSON. No explanations.`;


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
