import { NextResponse } from "next/server";
import { analyzeGlmOcrResponse } from "@/lib/glmOcrParser";
import type { DetectedNumber } from "@/lib/smartErase";

export const runtime = "nodejs";

// ====================================
// Types
// ====================================

interface GlmOcrRequest {
  imageBase64: string;
  mimeType: string;
  imageWidth: number;
  imageHeight: number;
}

/**
 * Z.AI layout_parsing API のレスポンス形式
 * https://open.bigmodel.cn/dev/api/ocr/glm-ocr
 */
interface LayoutParsingResponse {
  id: string;
  content: string; // パース結果（Markdown/LaTeX テキスト）
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  // エラー時
  error?: {
    code: string;
    message: string;
  };
}

// ====================================
// 設定
// ====================================

/** Z.AI layout_parsing エンドポイント（公式ドキュメント準拠） */
const ZAI_API_URL = "https://api.z.ai/api/paas/v4/layout_parsing";
const GLM_OCR_MODEL = "glm-ocr";

function getApiKey(): string {
  const key = process.env.ZAI_API_KEY;
  if (!key) {
    throw new Error(
      "ZAI_API_KEY が設定されていません。.env.local に ZAI_API_KEY を追加してください。\n" +
        "APIキー取得先: https://open.bigmodel.cn",
    );
  }
  return key;
}

// ====================================
// POST ハンドラー
// ====================================

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GlmOcrRequest;
    const { imageBase64, mimeType, imageWidth, imageHeight } = body;

    if (!imageBase64) {
      return NextResponse.json(
        { error: "imageBase64 is required" },
        { status: 400 },
      );
    }

    const apiKey = getApiKey();

    // data URI 形式に変換（Z.AI SDK の仕様に準拠）
    const fileDataUri = `data:${mimeType || "image/png"};base64,${imageBase64}`;

    // Z.AI layout_parsing API リクエスト
    // 公式: client.layout_parsing.create(model="glm-ocr", file=image_url)
    const payload = {
      model: GLM_OCR_MODEL,
      file: fileDataUri,
    };

    console.log("[GLM-OCR API] Sending request to Z.AI layout_parsing...");

    const response = await fetch(ZAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[GLM-OCR API] Z.AI error:", response.status, errorText);
      return NextResponse.json(
        { error: `Z.AI API エラー (${response.status}): ${errorText}` },
        { status: response.status },
      );
    }

    const glmResponse = (await response.json()) as LayoutParsingResponse;

    // エラーチェック
    if (glmResponse.error) {
      console.error("[GLM-OCR API] API error:", glmResponse.error);
      return NextResponse.json(
        { error: `GLM-OCR エラー: ${glmResponse.error.message}` },
        { status: 400 },
      );
    }

    const content = glmResponse.content;
    if (!content) {
      return NextResponse.json(
        {
          numbers: [],
          success: false,
          error: "GLM-OCR から空のレスポンスが返されました",
        },
        { status: 200 },
      );
    }

    console.log(
      "[GLM-OCR API] Raw response (first 500 chars):",
      content.substring(0, 500),
    );

    // LaTeX/Markdown から数字・役割を抽出
    const { tokens, rawText } = analyzeGlmOcrResponse(content);

    // DetectedNumber[] に変換（座標はプレースホルダー）
    const numbers: DetectedNumber[] = tokens.map((token, i) => ({
      text: token.text,
      bbox: {
        x: 0,
        y: i * 10,
        width: Math.round(imageWidth * 0.03),
        height: Math.round(imageHeight * 0.03),
      },
      role: token.role as DetectedNumber["role"],
      baselineY: undefined,
      fontStyle: undefined,
    }));

    console.log(`[GLM-OCR API] Extracted ${numbers.length} number tokens`);

    return NextResponse.json({
      numbers,
      success: numbers.length > 0,
      rawLatex: rawText,
      usage: glmResponse.usage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[GLM-OCR API Error]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
