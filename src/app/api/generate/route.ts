import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";

type GenerateResult = {
  extracted: {
    original_problem_text: string;
    original_math_expressions?: string[];
    diagram_description?: string;
  };
  new_problem: {
    problem_text: string;
  };
  solution: {
    steps: string[];
    final_answer: string;
  };
  audit: {
    changed_values: Array<{ from: string; to: string }>;
    answer_simplicity: "integer" | "simple_fraction";
  };
};

type GeminiListModel = {
  name: string;
  supportedGenerationMethods?: string[];
};

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

function normalizeModelName(input: string): string {
  // SDKには `gemini-...` の形式で渡す（`models/` プレフィックス等を除去）
  const trimmed = input.trim();
  const withoutPrefix = trimmed.replace(/^models\//i, "");
  // 万一余計な空白や改行が混ざっていても安全側に倒す
  return withoutPrefix.split(/\s+/)[0];
}

async function listAvailableModels(apiKey: string): Promise<GeminiListModel[]> {
  // @google/generative-ai が利用するエンドポイント(v1beta)に合わせる
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      // Next.js Route Handler: fetch は Node ランタイムで動作
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[Gemini API] ListModels failed", {
        status: res.status,
        statusText: res.statusText,
        body,
      });
      return [];
    }

    const data = (await res.json()) as { models?: GeminiListModel[] };
    return Array.isArray(data.models) ? data.models : [];
  } catch (error) {
    console.error("[Gemini API] ListModels threw", error);
    return [];
  }
}

function pickModel(
  listed: GeminiListModel[],
  preferred: string[]
): { chosen: string | null; supported: string[] } {
  const supported = listed
    .filter((m) =>
      (m.supportedGenerationMethods || []).includes("generateContent")
    )
    .map((m) => normalizeModelName(m.name));

  const supportedSet = new Set(supported);

  for (const p of preferred) {
    const normalized = normalizeModelName(p);
    if (supportedSet.has(normalized)) return { chosen: normalized, supported };
  }

  // 優先モデルが無い場合は、flash系 → それ以外 の順で選ぶ
  const flash = supported.find((m) => m.includes("flash"));
  if (flash) return { chosen: flash, supported };

  const first = supported[0] ?? null;
  return { chosen: first, supported };
}

const SYSTEM_INSTRUCTION = `あなたは塾講師を助ける数学の出題支援AIです。

重要: 推論過程（思考のメモ、自己対話、検証ログ、リトライの途中経過）は出力しない。内部でのみ行い、最終的にJSONのみを返す。

目的: 入力画像に写る数学問題から、数値だけを変更した「類題」を1問作り、模範解答（途中式）を作成する。

あなたの内部ワークフロー（必須）:
Step 1 (抽出): 画像内の問題文・数式・図形の意味を、できるだけ正確にテキスト化する。
Step 2 (改変): 論理構造は維持しつつ、数値（係数・定数・条件値など）をランダムに変更して新しい問題を作る。
  - 制約: 答えが「きれいな整数」または「簡単な分数（既約の小さな分母）」になるよう調整する。
Step 3 (検証/才覚): 新しい問題を自分で解き、解法が成立し計算が過度に複雑でないことを確認する。
  - 自己修正(リトライ・ループ): もし解法が成立しない／答えが汚い／計算が複雑すぎる場合は、数値を変更してStep 2からやり直す。
  - 1回の応答の中で内部的に最大5回までリトライしてよい。合格した時点で停止。
Step 4 (出力): 合格した「新しい問題文」と「模範解答（途中式含む）」を、指定スキーマのJSONで出力する。

出力スキーマ（厳守・余計なキー禁止）:
{
  "extracted": {
    "original_problem_text": string,
    "original_math_expressions"?: string[],
    "diagram_description"?: string
  },
  "new_problem": {
    "problem_text": string
  },
  "solution": {
    "steps": string[],
    "final_answer": string
  },
  "audit": {
    "changed_values": Array<{"from": string, "to": string}>,
    "answer_simplicity": "integer" | "simple_fraction"
  }
}
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

    // モデル名の正規化 + 実在するモデルを自動選択（v1betaで404になりにくくする）
    const requestedModel = normalizeModelName(
      process.env.GEMINI_MODEL || "gemini-1.5-flash"
    );

    const preferredModels = [
      requestedModel,
      `${requestedModel}-latest`,
      "gemini-1.5-flash",
      "gemini-1.5-pro",
    ].map(normalizeModelName);

    const listedModels = await listAvailableModels(apiKey);
    const { chosen: MODEL_NAME, supported } = pickModel(
      listedModels,
      preferredModels
    );

    console.log("[Gemini API] Requested model:", requestedModel);
    console.log("[Gemini API] Preferred models:", preferredModels);
    console.log(
      "[Gemini API] Supported generateContent models (normalized):",
      supported
    );

    if (!MODEL_NAME) {
      throw new Error(
        "No generateContent-capable models were returned by ListModels. Check API key permissions and available models in AI Studio."
      );
    }

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
