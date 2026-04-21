import { NextResponse } from "next/server";
import { runGlmOcrDetection } from "@/lib/glmOcrDetect";

export const runtime = "nodejs";

interface GlmOcrRequest {
  imageBase64: string;
  mimeType: string;
  imageWidth: number;
  imageHeight: number;
}

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
    if (!imageWidth || !imageHeight) {
      return NextResponse.json(
        { error: "imageWidth and imageHeight are required" },
        { status: 400 },
      );
    }

    const result = await runGlmOcrDetection({
      apiKey: getApiKey(),
      imageBase64,
      mimeType,
      imageWidth,
      imageHeight,
    });

    return NextResponse.json({
      numbers: result.numbers,
      tokens: result.tokens,
      success: result.numbers.length > 0,
      rawLatex: result.rawText,
      usage: result.usage,
      layoutDetailsCount: result.layoutDetailsCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[GLM-OCR API Error]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
