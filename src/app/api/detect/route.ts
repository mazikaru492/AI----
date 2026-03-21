import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_MODEL_LIST } from "@/lib/gemini";
import {
  analyzeGlmOcrResponse,
  mergeGlmOcrWithCoordinates,
  type LatexToken,
} from "@/lib/glmOcrParser";
import type {
  DetectedNumber,
  TextRole,
  FontStyle,
  CharBbox,
} from "@/lib/smartErase";

export const runtime = "nodejs";

interface DetectRequest {
  imageBase64: string;
  mimeType: string;
  imageWidth: number;
  imageHeight: number;
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
 * Structure-First Detection プロンプト
 *
 * 2ステップワークフロー:
 * 1. LaTeX形式で数式を書き起こし（構造理解）
 * 2. 各数字の座標を構造に基づいて検出
 */
const DETECTION_PROMPT = `You are an advanced Math Vision AI using **Structure-First Detection**.

## 2-Step Workflow

### Step 1: Semantic Analysis
First, **transcribe each mathematical expression to LaTeX**.
This forces you to understand:
- Which "2" is a coefficient (2x) vs exponent (x²)
- Where fractions are (numerator vs denominator)
- What is a subscript vs regular number

### Step 2: Coordinate Mapping
Based on your LaTeX understanding, locate each **integer digit**.

## Output JSON
{
  "numbers": [
    {
      "text": "2",
      "role": "coefficient",
      "ymin": 100, "xmin": 50, "ymax": 130, "xmax": 70,
      "fontStyle": "gothic"
    },
    {
      "text": "2",
      "role": "exponent",
      "ymin": 95, "xmin": 120, "ymax": 108, "xmax": 132,
      "fontStyle": "gothic"
    }
  ]
}

## Role Types (Critical for Font Sizing)
- \`coefficient\`: Number multiplying a variable (the "2" in "2x") - NORMAL size
- \`exponent\`: Superscript power (the "2" in x²) - SMALL size, above baseline
- \`subscript\`: Subscript index (the "1" in a₁) - SMALL size, below baseline
- \`constant\`: Standalone number - NORMAL size
- \`numerator\`: Top of fraction - may be smaller
- \`denominator\`: Bottom of fraction - may be smaller
- \`base\`: Default for any other number

## Critical Rules
1. **Box Precision**: Tight boxes around ONLY the digit's visible ink
2. **Exponent Boxes**: Must be SMALLER than coefficient boxes (they ARE visually smaller)
3. **No Merging**: "12" = TWO boxes (one for "1", one for "2")
4. **Skip Non-Digits**: Ignore x, y, sin, cos, +, -, =

## Coordinates
Scale: 0-1000 (0,0 = top-left, 1000,1000 = bottom-right)

## Font Styles
- "gothic": Most common Japanese math font
- "mincho": Serif style
- "maru-gothic": Rounded sans-serif
- "handwritten": If appears hand-drawn

Return ONLY raw JSON. No markdown, no explanations.`;

/**
 * レスポンスをパースしてピクセル座標に変換
 */
function parseDetectionResult(
  text: string,
  imageWidth: number,
  imageHeight: number,
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
      const validFontStyles = [
        "maru-gothic",
        "gothic",
        "mincho",
        "handwritten",
      ] as const;
      const fontStyle =
        n.fontStyle &&
        validFontStyles.includes(
          n.fontStyle as (typeof validFontStyles)[number],
        )
          ? (n.fontStyle as FontStyle)
          : undefined;

      // 文字役割の検証（Structure-First形式 → smartErase形式にマッピング）
      let role: TextRole = "base";
      if (n.role) {
        const roleStr = n.role.toLowerCase();
        if (
          roleStr === "exponent" ||
          roleStr === "sup" ||
          roleStr === "superscript"
        ) {
          role = "sup";
        } else if (roleStr === "subscript" || roleStr === "sub") {
          role = "sub";
        } else if (roleStr === "numerator") {
          role = "fraction-num";
        } else if (roleStr === "denominator") {
          role = "fraction-den";
        }
        // coefficient, constant, base, その他 → base
      }

      // 親文字（上付き・下付きの場合のみ）
      const parentChar =
        (role === "sup" || role === "sub") && n.parentChar
          ? n.parentChar
          : undefined;

      // 文字ごとのbboxをピクセル座標に変換
      const charBboxes = n.charBboxes?.map((cb) => ({
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

// ====================================
// GLM-OCR ハイブリッド統合
// ====================================

/** Z.AI layout_parsing エンドポイント */
const ZAI_API_URL = "https://api.z.ai/api/paas/v4/layout_parsing";
const GLM_OCR_MODEL = "glm-ocr";

interface LayoutParsingResponse {
  id: string;
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * GLM-OCR で LaTeX 構造を取得
 * エラー時は空配列を返す（フォールバック）
 */
async function getGlmOcrTokens(
  imageBase64: string,
  mimeType: string,
): Promise<LatexToken[]> {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    console.log("[GLM-OCR] ZAI_API_KEY not set, skipping GLM-OCR");
    return [];
  }

  try {
    const fileDataUri = `data:${mimeType || "image/png"};base64,${imageBase64}`;

    console.log("[GLM-OCR] Sending request to Z.AI layout_parsing...");

    const response = await fetch(ZAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GLM_OCR_MODEL,
        file: fileDataUri,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[GLM-OCR] Z.AI error:", response.status, errorText);
      return [];
    }

    const glmResponse = (await response.json()) as LayoutParsingResponse;

    if (glmResponse.error || !glmResponse.content) {
      console.error("[GLM-OCR] API error:", glmResponse.error);
      return [];
    }

    console.log(
      "[GLM-OCR] Raw response (first 300 chars):",
      glmResponse.content.substring(0, 300),
    );

    const { tokens } = analyzeGlmOcrResponse(glmResponse.content);
    console.log(`[GLM-OCR] Extracted ${tokens.length} tokens`);
    return tokens;
  } catch (error) {
    console.error("[GLM-OCR] Error:", error);
    return [];
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as DetectRequest;
    const { imageBase64, mimeType, imageWidth, imageHeight } = body;

    if (!imageBase64) {
      return NextResponse.json(
        { error: "imageBase64 is required" },
        { status: 400 },
      );
    }

    const apiKey = getApiKey();
    const genAI = new GoogleGenerativeAI(apiKey);

    // GLM-OCR を並列で呼び出し（座標マージ用）
    const glmOcrPromise = getGlmOcrTokens(imageBase64, mimeType);

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
          console.log(
            `[Detect API] Found ${detection.numbers.length} numbers from Gemini`,
          );

          // GLM-OCR の結果を待ってマージ
          const glmTokens = await glmOcrPromise;
          let finalNumbers = detection.numbers;

          if (glmTokens.length > 0) {
            console.log(
              `[Detect API] Merging with ${glmTokens.length} GLM-OCR tokens`,
            );
            finalNumbers = mergeGlmOcrWithCoordinates(
              detection.numbers,
              glmTokens,
            );
            console.log(
              "[Detect API] Merged roles:",
              finalNumbers.map((n) => `${n.text}:${n.role}`).join(", "),
            );
          }

          return NextResponse.json({
            numbers: finalNumbers,
            success: true,
            glmOcrUsed: glmTokens.length > 0,
          });
        }

        console.log("[Detect API] No numbers, trying next model...");
      } catch (e) {
        console.log(`[Detect API] ${modelName} failed:`, e);
        continue;
      }
    }

    return NextResponse.json(
      { numbers: [], success: false, error: "No numbers detected" },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Detect API Error]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
