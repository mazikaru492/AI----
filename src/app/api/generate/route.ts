import { NextResponse } from "next/server";
import {
  GoogleGenerativeAI,
  SchemaType,
  type ResponseSchema,
} from "@google/generative-ai";

export const runtime = "nodejs";

type ProblemItem = {
  id: number;
  original: string;
  question: string;
  answer: string;
};

type GenerateResult = ProblemItem[];

const RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.ARRAY,
  minItems: 1,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      id: { type: SchemaType.NUMBER },
      original: { type: SchemaType.STRING },
      question: { type: SchemaType.STRING },
      answer: { type: SchemaType.STRING },
    },
    required: ["id", "original", "question", "answer"],
  },
};

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
  // まずは素直にJSON.parse
  const cleaned = stripCodeFences(rawText)
    .trim()
    // ゼロ幅文字などを除去（パース失敗の原因になりやすい）
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

function getApiKey(): string {
  // Vercelの環境変数名に対応（GOOGLE_GEMINI_API_KEYまたはGEMINI_API_KEY）
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

let cachedResolvedModel: string | null = null;
let cachedResolvedModelAt = 0;
const MODEL_CACHE_MS = 1000 * 60 * 60; // 1 hour

// デフォルトのモデル名（環境変数がない場合に使用）
const DEFAULT_MODEL = "gemini-2.0-flash";

function getConfiguredModelName(): string {
  // どちらの環境変数でも指定できるようにしておく
  const raw =
    process.env.GOOGLE_GEMINI_MODEL ||
    process.env.GEMINI_MODEL ||
    process.env.GOOGLE_GENERATIVE_AI_MODEL;
  if (!raw) return DEFAULT_MODEL;
  // RESTの name は 'models/xxx' 形式。SDK側は 'xxx' を期待することが多いので揃える。
  return raw.replace(/^models\//, "");
}

type ListModelsResponse = {
  models?: Array<{
    name?: string;
    supportedGenerationMethods?: string[];
  }>;
};

async function resolveModelName(apiKey: string): Promise<string> {
  const configured = getConfiguredModelName();
  if (configured) return configured;

  const now = Date.now();
  if (cachedResolvedModel && now - cachedResolvedModelAt < MODEL_CACHE_MS) {
    return cachedResolvedModel;
  }

  // 利用可能モデルを取得して、generateContent対応のものを選ぶ
  const url = new URL(
    "https://generativelanguage.googleapis.com/v1beta/models"
  );
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    // Next.jsが勝手にキャッシュしないように
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to list models (${res.status}): ${body || res.statusText}`
    );
  }

  const json = (await res.json()) as ListModelsResponse;
  const models = Array.isArray(json.models) ? json.models : [];
  const generateContentModels = models
    .map((m) => ({
      name: typeof m.name === "string" ? m.name : "",
      methods: Array.isArray(m.supportedGenerationMethods)
        ? m.supportedGenerationMethods
        : [],
    }))
    .filter((m) => m.name && m.methods.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""));

  console.log(
    "[Gemini API] Supported models (generateContent):",
    generateContentModels.slice(0, 20)
  );

  if (generateContentModels.length === 0) {
    throw new Error(
      "No available models found for generateContent. Please check API key permissions."
    );
  }

  // なるべく高速なflash系を優先（新しいバージョンから試す）
  // gemini-2.0-flash > gemini-2.5-flash > その他flash > 先頭
  const preferredCandidates = [
    /gemini-2\.0-flash/i,
    /gemini-2\.5-flash/i,
    /gemini-2\.\d+-flash/i,
    /flash/i,
  ];

  let preferred: string | undefined;
  for (const pattern of preferredCandidates) {
    preferred = generateContentModels.find((name) => pattern.test(name));
    if (preferred) break;
  }
  preferred = preferred || generateContentModels[0];

  cachedResolvedModel = preferred;
  cachedResolvedModelAt = now;
  return preferred;
}

const SYSTEM_INSTRUCTION = `あなたは塾講師を助ける数学の出題支援AIです。

重要: 推論過程は出力せず、最終的にJSONのみを返してください。

目的: 入力画像に含まれるすべての数学問題を特定し、それらすべてに対して数値を変えた類題を作成してください。

ワークフロー:
1. 画像内のすべての問題を上から下、左から右の順に特定する
2. 各問題について、数値のみを変更した類題を作成する
3. 答えが「きれいな整数」または「簡単な分数」になるよう調整する
4. 各問題の解答も記載する

出力形式（厳守）:
[
  { "id": 1, "original": "元の問題文", "question": "作成した類題", "answer": "類題の解答" },
  { "id": 2, "original": "元の問題文", "question": "作成した類題", "answer": "類題の解答" }
]

注意:
- 問題の順番は画像の上から下、左から右の順を厳守
- id は 1 から順に採番
- 画像に問題が1つしかない場合も配列で返す
`;

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

    // Gemini API初期化
    const apiKey = getApiKey();
    const genAI = new GoogleGenerativeAI(apiKey);

    const MODEL_NAME = await resolveModelName(apiKey);
    console.log(`[Gemini API] Using model: ${MODEL_NAME}`);

    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction: SYSTEM_INSTRUCTION,
    });

    const userPrompt =
      "次の画像を解析し、上記の内部ワークフローに従ってJSONを生成してください。" +
      "重要: 出力は必ず '[' から始まるJSON配列のみ。説明文・Markdown・```json などのコードフェンスは禁止。";

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { data: base64, mimeType: file.type } },
            { text: userPrompt },
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

    let json: GenerateResult;
    try {
      json = parseGenerateResult(text);
    } catch (e) {
      const parseError = e instanceof Error ? e.message : "Parse failed";
      const rawPreview = String(text).slice(0, 2000);
      return NextResponse.json(
        {
          error: "model did not return valid JSON",
          details: parseError,
          rawPreview,
        },
        { status: 502 }
      );
    }

    return NextResponse.json(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    // 詳細なエラーログを出力
    console.error("[Gemini API Error] Full error:", error);
    console.error("[Gemini API Error] Error message:", message);
    if (error instanceof Error && error.stack) {
      console.error("[Gemini API Error] Stack trace:", error.stack);
    }

    // 429 レート制限エラーの検知
    if (
      message.includes("429") ||
      message.toLowerCase().includes("quota") ||
      message.toLowerCase().includes("rate limit")
    ) {
      return NextResponse.json(
        {
          error:
            "利用制限に達しました。1分ほど間隔を空けてから再度お試しください。",
        },
        { status: 429 }
      );
    }

    // 404エラー（モデルが見つからない）の検知
    if (
      message.includes("404") ||
      message.toLowerCase().includes("not found")
    ) {
      console.error("[Gemini API Error] Model not found error detected");
      return NextResponse.json(
        {
          error:
            `モデルが見つかりません: ${message}. ` +
            "環境変数でモデルを上書きする場合は GEMINI_MODEL（例: gemini-2.0-flash 等）を設定してください。" +
            "（サーバーログに Supported models を出力しています）",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
