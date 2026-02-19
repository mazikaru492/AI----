import { NextResponse } from "next/server";

export const runtime = "nodejs";

// ====================================
// Types
// ====================================

/**
 * Azure Document Intelligence prebuilt-layout のレスポンス型
 * API: 2024-11-30
 */
interface AzureDocIntelligenceResult {
  analyzeResult: {
    pages: Array<{
      words: Array<{
        content: string;
        polygon: number[]; // [x1,y1,x2,y2,x3,y3,x4,y4] — 8点ポリゴン
        confidence: number;
      }>;
    }>;
  };
}

/** ポーリング用 Operation レスポンス */
interface AzureOperationResponse {
  status: "running" | "succeeded" | "failed" | "notStarted";
  analyzeResult?: AzureDocIntelligenceResult["analyzeResult"];
  error?: { message: string };
}

/** クライアントに返す検出結果 */
export interface PolygonWord {
  text: string;
  /** 8点ポリゴン座標 [x1,y1,x2,y2,x3,y3,x4,y4] (元画像ピクセル単位) */
  polygon: number[];
  confidence: number;
}

// ====================================
// 設定
// ====================================

function getConfig() {
  const key = process.env.AZURE_DI_KEY;
  const endpoint = process.env.AZURE_DI_ENDPOINT;

  if (!key || !endpoint) {
    throw new Error(
      "AZURE_DI_KEY / AZURE_DI_ENDPOINT が設定されていません。\n" +
        ".env.local に以下を追加してください:\n" +
        "AZURE_DI_KEY=your_key\n" +
        "AZURE_DI_ENDPOINT=https://your-resource.cognitiveservices.azure.com",
    );
  }
  return { key, endpoint: endpoint.replace(/\/$/, "") };
}

/**
 * 整数のみを抽出するフィルタ
 * 数字 1桁以上の連続のみ（x, +, =, α, Σ などは除外）
 */
const INTEGER_RE = /^\d+$/;

/** ポーリング間隔(ms) / 最大試行回数 */
const POLL_INTERVAL = 1000;
const POLL_MAX = 20;

// ====================================
// POST ハンドラー
// ====================================

export async function POST(request: Request) {
  try {
    const { key, endpoint } = getConfig();

    // FormData からバイナリ画像を取得
    const formData = await request.formData();
    const imageFile = formData.get("image") as File | null;

    if (!imageFile) {
      return NextResponse.json(
        { error: "image フィールドが必要です" },
        { status: 400 },
      );
    }

    const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
    const mimeType = imageFile.type || "image/png";

    // ============================================
    // Step 1: 解析ジョブを投入（非同期 Kick-off）
    // Azure Doc Intelligence は 202 + Operation-Location を返す
    // ============================================
    const analyzeUrl =
      `${endpoint}/documentintelligence/documentModels/prebuilt-layout:analyze` +
      `?api-version=2024-11-30`;

    console.log("[Azure DI] Submitting analyze job...");

    const kickoffRes = await fetch(analyzeUrl, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": mimeType,
      },
      body: imageBuffer,
    });

    if (!kickoffRes.ok) {
      const errText = await kickoffRes.text();
      return NextResponse.json(
        {
          error: `Azure Doc Intelligence エラー (${kickoffRes.status}): ${errText}`,
        },
        { status: kickoffRes.status },
      );
    }

    // Operation-Location ヘッダーからジョブURLを取得
    const operationUrl = kickoffRes.headers.get("Operation-Location");
    if (!operationUrl) {
      return NextResponse.json(
        { error: "Operation-Location ヘッダーが見つかりません" },
        { status: 500 },
      );
    }

    // ============================================
    // Step 2: ポーリングで結果を取得
    // ============================================
    let analyzeResult: AzureDocIntelligenceResult["analyzeResult"] | undefined;

    for (let attempt = 0; attempt < POLL_MAX; attempt++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));

      const pollRes = await fetch(operationUrl, {
        headers: { "Ocp-Apim-Subscription-Key": key },
      });

      // HTTP レベルのエラーを先にチェック（非200でもJSONパースを試みるとクラッシュする）
      if (!pollRes.ok) {
        const errText = await pollRes.text();
        return NextResponse.json(
          { error: `ポーリング失敗 (${pollRes.status}): ${errText}` },
          { status: pollRes.status },
        );
      }

      let pollData: AzureOperationResponse;
      try {
        pollData = (await pollRes.json()) as AzureOperationResponse;
      } catch {
        return NextResponse.json(
          { error: "Azure のレスポンスが不正な JSON です" },
          { status: 502 },
        );
      }

      console.log(`[Azure DI] Poll ${attempt + 1}: ${pollData.status}`);

      if (pollData.status === "succeeded") {
        // succeededでもanalyzeResultが欠落しているケースを防ぐ
        if (!pollData.analyzeResult) {
          return NextResponse.json(
            { error: "Azure レスポンスに analyzeResult がありません" },
            { status: 502 },
          );
        }
        analyzeResult = pollData.analyzeResult;
        break;
      }
      if (pollData.status === "failed") {
        return NextResponse.json(
          { error: `Azure 解析失敗: ${pollData.error?.message ?? "Unknown"}` },
          { status: 500 },
        );
      }
    }

    if (!analyzeResult) {
      return NextResponse.json(
        { error: "タイムアウト: Azure の解析が時間内に完了しませんでした" },
        { status: 504 },
      );
    }

    // ============================================
    // Step 3: words を走査し整数のみ抽出
    // ============================================
    const numbers: PolygonWord[] = [];

    for (const page of analyzeResult.pages ?? []) {
      // wordsが存在しないページも安全にスキップ
      for (const word of page.words ?? []) {
        if (
          typeof word.content === "string" &&
          INTEGER_RE.test(word.content) &&
          typeof word.confidence === "number" &&
          word.confidence >= 0.5 &&
          Array.isArray(word.polygon) &&
          word.polygon.length === 8 &&
          word.polygon.every((v) => typeof v === "number" && isFinite(v))
        ) {
          numbers.push({
            text: word.content,
            polygon: word.polygon,
            confidence: word.confidence,
          });
        }
      }
    }

    console.log(`[Azure DI] Found ${numbers.length} integer words`);

    return NextResponse.json({ numbers, success: numbers.length > 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Azure DI Error]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
