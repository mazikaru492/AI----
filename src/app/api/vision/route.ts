/**
 * Vision 座標検出 API
 *
 * Gemini Vision APIを使用して画像内の数字を検出し、
 * 0-1正規化座標でバウンディングボックスを返す
 */

import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  VISION_MODEL_LIST,
  VISION_SYSTEM_INSTRUCTION,
  VISION_USER_PROMPT,
  type DetectedToken,
  type VisionDetectionResult,
} from '@/lib/gemini';

export const runtime = 'nodejs';
export const maxDuration = 60; // タイムアウト延長（大量トークン対応）

/**
 * APIキー取得
 */
function getApiKey(): string {
  const key = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GOOGLE_GEMINI_API_KEY is not set');
  }
  return key;
}

/**
 * レスポンスからJSONをパース
 */
function parseVisionResponse(text: string): VisionDetectionResult {
  // JSONオブジェクトを抽出
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('JSON object not found in response');
  }

  const parsed = JSON.parse(jsonMatch[0]) as unknown;

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Response is not an object');
  }

  const result = parsed as Record<string, unknown>;

  if (!Array.isArray(result.tokens)) {
    // tokensが存在しない場合は空配列として扱う
    return { tokens: [] };
  }

  // 各トークンを検証・正規化
  const tokens: DetectedToken[] = result.tokens
    .filter((token): token is Record<string, unknown> => {
      return (
        typeof token === 'object' &&
        token !== null &&
        typeof (token as Record<string, unknown>).text === 'string' &&
        Array.isArray((token as Record<string, unknown>).bbox_norm)
      );
    })
    .map((token) => {
      const bbox = token.bbox_norm as number[];
      return {
        text: String(token.text),
        role: validateRole(token.role),
        bbox_norm: [
          Number(bbox[0]) || 0,
          Number(bbox[1]) || 0,
          Number(bbox[2]) || 0,
          Number(bbox[3]) || 0,
        ] as [number, number, number, number],
        confidence: Number(token.confidence) || 0.5,
      };
    })
    // 無効なbboxをフィルタリング
    .filter((token) => {
      const [x_min, y_min, x_max, y_max] = token.bbox_norm;
      return (
        x_min >= 0 &&
        y_min >= 0 &&
        x_max <= 1 &&
        y_max <= 1 &&
        x_max > x_min &&
        y_max > y_min
      );
    });

  return { tokens };
}

/**
 * roleを検証
 */
function validateRole(role: unknown): 'base' | 'superscript' | 'subscript' {
  if (role === 'superscript') return 'superscript';
  if (role === 'subscript') return 'subscript';
  return 'base';
}

/**
 * Base64画像データからMIMEタイプを抽出
 */
function extractMimeType(base64Data: string): string {
  const match = base64Data.match(/^data:([^;]+);base64,/);
  return match ? match[1] : 'image/png';
}

/**
 * Base64データからピュアBase64を抽出
 */
function extractPureBase64(base64Data: string): string {
  const match = base64Data.match(/^data:[^;]+;base64,(.+)$/);
  return match ? match[1] : base64Data;
}

interface VisionRequest {
  image: string; // Base64エンコード画像（data:image/...;base64,...）
  confidenceThreshold?: number; // 最小confidence閾値（デフォルト: 0.5）
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VisionRequest;
    const { image, confidenceThreshold = 0.5 } = body;

    if (!image || typeof image !== 'string') {
      return NextResponse.json(
        { error: 'image (base64) is required' },
        { status: 400 }
      );
    }

    const apiKey = getApiKey();
    const genAI = new GoogleGenerativeAI(apiKey);

    const mimeType = extractMimeType(image);
    const pureBase64 = extractPureBase64(image);

    // 各モデルで試行
    for (const modelName of VISION_MODEL_LIST) {
      try {
        console.log(`[Vision API] Trying model: ${modelName}`);

        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: VISION_SYSTEM_INSTRUCTION,
        });

        const result = await model.generateContent([
          VISION_USER_PROMPT,
          {
            inlineData: {
              mimeType,
              data: pureBase64,
            },
          },
        ]);

        const text = result.response.text();
        console.log(`[Vision API] Response length: ${text.length}`);

        const detection = parseVisionResponse(text);

        // confidence閾値でフィルタリング
        const filteredTokens = detection.tokens.filter(
          (t) => t.confidence >= confidenceThreshold
        );

        console.log(
          `[Vision API] Detected ${detection.tokens.length} tokens, ${filteredTokens.length} above threshold`
        );

        return NextResponse.json({
          tokens: filteredTokens,
          totalDetected: detection.tokens.length,
          model: modelName,
        });
      } catch (e) {
        const error = e as Error;
        console.log(`[Vision API] Failed with ${modelName}:`, error.message);
        continue;
      }
    }

    return NextResponse.json({ error: 'All models failed' }, { status: 500 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Vision API Error]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
