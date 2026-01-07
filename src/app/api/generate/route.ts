import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { GenerateResult } from "@/types";
import {
  GEMINI_MODEL_LIST,
  RESPONSE_SCHEMA,
  SYSTEM_INSTRUCTION,
  USER_PROMPT,
} from "@/lib/gemini";

export const runtime = "nodejs";

// =====================================
// Helper Functions
// =====================================

function stripCodeFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return fenced ? fenced[1] : text;
}

function extractJsonArraySubstring(text: string): string | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function parseGenerateResult(rawText: string): GenerateResult {
  const cleaned = stripCodeFences(rawText)
    .trim()
    .replace(/\uFEFF/g, "")
    .replace(/[\u200B-\u200D\u2060]/g, "");

  const candidates: string[] = [cleaned];
  const extracted = extractJsonArraySubstring(cleaned);
  if (extracted && extracted !== cleaned) candidates.push(extracted);

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const json = JSON.parse(candidate) as unknown;
      if (!Array.isArray(json)) {
        throw new Error("Response is not an array");
      }
      if (json.length === 0) {
        throw new Error("Empty result array");
      }
      for (const item of json) {
        if (
          typeof item !== "object" ||
          !item ||
          typeof (item as { id?: unknown }).id !== "number" ||
          typeof (item as { original?: unknown }).original !== "string" ||
          typeof (item as { question?: unknown }).question !== "string" ||
          typeof (item as { answer?: unknown }).answer !== "string"
        ) {
          throw new Error("Invalid problem item structure");
        }
      }
      return json as GenerateResult;
    } catch (e) {
      lastError = e;
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : "Parse failed";
  throw new Error(message);
}

function isRateLimitErrorMessage(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("resource exhausted")
  );
}

function isNotFoundErrorMessage(message: string): boolean {
  const msg = message.toLowerCase();
  return msg.includes("404") || msg.includes("not found");
}

function getApiKey(): string {
  const key = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "GOOGLE_GEMINI_API_KEY or GEMINI_API_KEY is not set. Add it to .env.local or Vercel Environment Variables"
    );
  }
  return key;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString("base64");
}

function getModelsToTry(): string[] {
  const envModel =
    process.env.GOOGLE_GEMINI_MODEL ||
    process.env.GEMINI_MODEL ||
    process.env.GOOGLE_GENERATIVE_AI_MODEL;

  if (envModel) {
    const cleaned = envModel.replace(/^models\//, "");
    return [cleaned, ...GEMINI_MODEL_LIST.filter((m) => m !== cleaned)];
  }
  return [...GEMINI_MODEL_LIST];
}

// =====================================
// Model Generation
// =====================================

interface GenerateAttemptResult {
  success: boolean;
  result?: GenerateResult;
  error?: Error;
  isRateLimit?: boolean;
}

async function tryGenerateWithModel(
  genAI: GoogleGenerativeAI,
  modelName: string,
  base64: string,
  mimeType: string
): Promise<GenerateAttemptResult> {
  try {
    console.log(`[Gemini API] Trying model: ${modelName}`);

    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: SYSTEM_INSTRUCTION,
    });

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { data: base64, mimeType } },
            { text: USER_PROMPT },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.2,
      },
    });

    const text = result.response.text();
    const json = parseGenerateResult(text);

    console.log(`[Gemini API] Success with model: ${modelName}`);
    return { success: true, result: json };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const isRateLimit = isRateLimitErrorMessage(err.message);

    console.log(
      `[Gemini API] Failed with model ${modelName}: ${err.message} (isRateLimit: ${isRateLimit})`
    );

    return { success: false, error: err, isRateLimit };
  }
}

// =====================================
// Route Handler
// =====================================

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("image");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "image file is required (field name: image)" },
        { status: 400 }
      );
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "only image/* is supported" },
        { status: 400 }
      );
    }

    const imageBytes = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(imageBytes);

    const apiKey = getApiKey();
    const genAI = new GoogleGenerativeAI(apiKey);

    const modelsToTry = getModelsToTry();
    console.log(`[Gemini API] Models to try: ${modelsToTry.join(", ")}`);

    let lastError: Error | null = null;
    let allRateLimited = true;

    // Try each model in order
    for (const modelName of modelsToTry) {
      const result = await tryGenerateWithModel(
        genAI,
        modelName,
        base64,
        file.type
      );

      if (result.success && result.result) {
        return NextResponse.json(result.result);
      }

      if (result.error) {
        lastError = result.error;
        if (!result.isRateLimit) {
          allRateLimited = false;
        }
      }

      // Wait before trying next model on rate limit
      if (result.isRateLimit) {
        console.log(
          `[Gemini API] Rate limited, waiting 1s before trying next model...`
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // All models failed
    const message = lastError?.message || "Unknown error";

    if (allRateLimited) {
      return NextResponse.json(
        {
          error:
            "すべてのモデルで利用制限に達しました。しばらく時間を空けてから再度お試しください。" +
            "（Googleの無料枠は1日あたりのリクエスト数に制限があります）",
        },
        { status: 429 }
      );
    }

    if (isNotFoundErrorMessage(message)) {
      return NextResponse.json(
        {
          error: `モデルが見つかりません: ${message}`,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Gemini API Error]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
