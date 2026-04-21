import { NextResponse } from "next/server";
import { runGlmOcrDetection } from "@/lib/glmOcrDetect";
import type { DetectedNumber } from "@/lib/smartErase";

export const runtime = "nodejs";

const DETECT_CACHE_TTL_MS = 10 * 60 * 1000;
const detectResultCache = new Map<string, { expiresAt: number; value: DetectedNumber[] }>();

interface DetectRequest {
  imageBase64: string;
  mimeType: string;
  imageWidth: number;
  imageHeight: number;
}

function isPayloadTooLargeError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("request entity too large") ||
    message.includes("payload too large") ||
    message.includes("content length") ||
    (message.includes("unexpected token") && message.includes("request en"))
  );
}

function getApiKey(): string {
  const key = process.env.ZAI_API_KEY;
  if (!key) {
    throw new Error("ZAI_API_KEY が設定されていません。.env.local に追加してください。");
  }
  return key;
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
    if (!imageWidth || !imageHeight) {
      return NextResponse.json(
        { error: "imageWidth and imageHeight are required" },
        { status: 400 },
      );
    }

    const cacheKey = `${imageBase64.length}:${mimeType || "image/png"}:${imageWidth}x${imageHeight}:${imageBase64.slice(0, 256)}`;
    const cached = detectResultCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({
        numbers: cached.value,
        success: true,
        glmOcrUsed: true,
        cached: true,
      });
    }

    const result = await runGlmOcrDetection({
      apiKey: getApiKey(),
      imageBase64,
      mimeType,
      imageWidth,
      imageHeight,
    });

    if (result.numbers.length === 0) {
      return NextResponse.json(
        { numbers: [], success: false, error: "No numbers detected by GLM-OCR" },
        { status: 200 },
      );
    }

    detectResultCache.set(cacheKey, {
      expiresAt: Date.now() + DETECT_CACHE_TTL_MS,
      value: result.numbers,
    });

    return NextResponse.json({
      numbers: result.numbers,
      success: true,
      glmOcrUsed: true,
      layoutDetailsCount: result.layoutDetailsCount,
      usage: result.usage,
    });
  } catch (error) {
    console.error("[Detect API Error]", error);
    if (isPayloadTooLargeError(error)) {
      return NextResponse.json(
        { error: "画像サイズが大きすぎます。画像を小さくして再度お試しください。" },
        { status: 413 },
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
