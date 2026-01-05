import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";

type ProblemItem = {
  id: number;
  original: string;
  question: string;
  answer: string;
};

type GenerateResult = ProblemItem[];

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

    // モデル名を gemini-1.5-flash に固定
    const MODEL_NAME = "gemini-1.5-flash";
    console.log(`[Gemini API] Using model: ${MODEL_NAME}`);

    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction: SYSTEM_INSTRUCTION,
    });

    const userPrompt = `次の画像を解析し、上記の内部ワークフローに従ってJSONを生成してください。`;

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
        temperature: 0.4,
      },
    });

    const text = result.response.text();

    let json: GenerateResult;
    try {
      json = JSON.parse(text) as GenerateResult;
    } catch {
      return NextResponse.json(
        {
          error: "model did not return valid JSON",
          raw: text,
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
          error: `モデルが見つかりません: ${message}. （サーバーログに Requested/Preferred/Supported models を出力しています）APIキーと利用可能モデルを確認してください。`,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
