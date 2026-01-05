import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const SYSTEM_PROMPT = `あなたは数学教育の専門家AIです。画像から数学の問題を抽出し、数値を変えた類題を作成してください。

## 処理手順 (Chain of Thought)

### Step 1: 抽出
- 画像内の問題文、数式、図形の意味を正確にテキスト化する
- 変数、定数、条件を明確に識別する

### Step 2: 改変
- 問題の論理構造・解法パターンはそのまま維持
- 数値をランダムに変更
- **重要な制約**:
  - 答えが「きれいな整数」や「簡単な分数（1/2, 3/4など）」になるよう調整
  - 計算途中も可能な限り簡潔な数値になるよう配慮

### Step 3: 検証 (自己修正ループ)
- 作成した新しい問題を実際に解いてみる
- 以下の場合はStep 2に戻って数値を再調整：
  - 解法が成立しない
  - 計算が複雑すぎる（小数点以下が長い、分母が大きすぎるなど）
  - 答えが不自然（負の距離、100%超の確率など）
- 最大3回までリトライ

### Step 4: 出力
検証に合格した問題のみ、以下のJSON形式で出力：

{
  "originalProblem": "元の問題文（抽出結果）",
  "newProblem": "新しい問題文（改変結果）",
  "solution": "模範解答の説明文",
  "steps": ["解答ステップ1", "解答ステップ2", "..."],
  "answer": "最終的な答え"
}

## 注意事項
- 問題の難易度レベルは維持する
- 図形問題の場合は、図形の説明も含める
- 文章題の場合は、文脈を自然に変更してもよい（名前、物の種類など）`;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get("image") as File | null;

    if (!imageFile) {
      return NextResponse.json(
        { success: false, error: "画像がアップロードされていません" },
        { status: 400 }
      );
    }

    // 画像をBase64に変換
    const bytes = await imageFile.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const mimeType = imageFile.type;

    // Gemini Pro Vision モデルを使用
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-pro",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    });

    const result = await model.generateContent([
      SYSTEM_PROMPT,
      {
        inlineData: {
          mimeType,
          data: base64,
        },
      },
    ]);

    const response = result.response;
    const text = response.text();

    // JSONをパース
    const data = JSON.parse(text);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "問題の生成中にエラーが発生しました"
      },
      { status: 500 }
    );
  }
}
