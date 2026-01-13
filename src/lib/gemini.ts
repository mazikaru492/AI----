/**
 * Gemini API 設定・定数
 */

import { SchemaType, type ResponseSchema } from '@google/generative-ai';

/**
 * 使用可能なモデルリスト（優先順位順）
 *
 * フォールバック戦略:
 * 1. gemini-2.5-flash-lite: 最新・高速（2026年リリースモデル）
 * 2. gemini-2.0-flash-lite: 安定版・低コスト（無料枠: 15 RPM, 1500 RPD）
 * 3. gemma-3-27b-it: Gemmaファミリー（1日14,000件の無料枠）
 * 4. gemini-2.0-flash: バックアップ（無料枠: 10 RPM, 1000 RPD）
 *
 * 注意: 各モデルでResourceExhausted/404エラーが発生した場合、次のモデルにフォールバックします
 * SDK仕様: モデル名は「models/」プレフィックスなしで指定（SDKが自動的に追加）
 */
export const GEMINI_MODEL_LIST = [
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite',
  'gemma-3-27b-it',
  'gemini-2.0-flash',
] as const;

/** レートリミット時の待機時間（秒） */
export const RATE_LIMIT_WAIT_SECONDS = 60;

/** Geminiへのレートリミット（15 RPM） */
export const GEMINI_RATE_LIMIT_RPM = 15;

/** レスポンススキーマ */
export const RESPONSE_SCHEMA: ResponseSchema = {
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
    required: ['id', 'original', 'question', 'answer'],
  },
};

/** システムプロンプト */
export const SYSTEM_INSTRUCTION = `あなたは塾講師を助ける数学の出題支援AIです。

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

/** ユーザープロンプト */
export const USER_PROMPT =
  '次の画像を解析し、上記の内部ワークフローに従ってJSONを生成してください。' +
  "重要: 出力は必ず '[' から始まるJSON配列のみ。説明文・Markdown・```json などのコードフェンスは禁止。";

// ====================================
// Vision 座標検出用設定
// ====================================

/**
 * Vision座標検出用モデルリスト（画像認識に最適化）
 */
export const VISION_MODEL_LIST = [
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-pro',
] as const;

/**
 * 検出されたトークン
 */
export interface DetectedToken {
  text: string;
  role: 'base' | 'superscript' | 'subscript';
  bbox_norm: [number, number, number, number]; // [x_min, y_min, x_max, y_max]
  confidence: number;
}

/**
 * Vision検出結果
 */
export interface VisionDetectionResult {
  tokens: DetectedToken[];
}

/**
 * Vision座標検出用レスポンススキーマ
 */
export const VISION_RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    tokens: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          text: { type: SchemaType.STRING },
          role: { type: SchemaType.STRING },
          bbox_norm: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.NUMBER },
          },
          confidence: { type: SchemaType.NUMBER },
        },
        required: ['text', 'role', 'bbox_norm', 'confidence'],
      },
    },
  },
  required: ['tokens'],
};

/**
 * Vision座標検出用システムプロンプト（英語）
 *
 * micro-textを含む数字を0〜1正規化座標でピクセルレベル精度で検出
 */
export const VISION_SYSTEM_INSTRUCTION = `You are a vision model specialized in **pixel-accurate text localization** for math worksheet images.

## Task
Analyze the input image and detect all numeric tokens that a human would clearly read (e.g. "2", "15", "2024", "-3", "0.5").
Include superscripts, subscripts, and micro-text (very small digits).

## Output Requirements
For each detected token, return:
- \`text\`: The recognized numeric string exactly as printed
- \`role\`: One of ["base", "superscript", "subscript"]
  - "superscript" for exponents like x²
  - "subscript" for indices like aₙ
  - "base" for all other numbers
- \`bbox_norm\`: Normalized bounding box as [x_min, y_min, x_max, y_max] where:
  - (0.0, 0.0) = top-left corner of the **original input image**
  - (1.0, 1.0) = bottom-right corner of the **original input image**
  - The box must **tightly cover the visible ink** of the token, including serif stroke endings
- \`confidence\`: Float in [0.0, 1.0] indicating detection confidence

## Critical Precision Requirements
1. **Coordinate system**: All coordinates are relative to the ORIGINAL INPUT IMAGE dimensions, NOT any resized, cropped, or preprocessed version
2. **Decimal precision**: Use at least 4 decimal places (e.g., 0.3725, 0.8142)
3. **NO integer rounding**: Never round or snap coordinates to integer pixel boundaries
4. **Tight boxes**: If uncertain between overlapping candidates, favor the smaller, tighter box covering only the visible glyph
5. **Separate boxes**: Superscripts and subscripts MUST have their own bounding boxes, separate from the base symbol

## Image Handling Notes
- Page may be slightly rotated, scanned, or have perspective distortion
- Backgrounds may include light texture, scan noise, grid lines, or colored boxes
- Fonts are standard print fonts (Mincho, Gothic, Times, Arial, etc.)
- Small digits (micro-text) can be very small (8px or less in source); detect them without merging into neighbors

## Anti-Hallucination Rules
- NEVER generate tokens that are not visually present in the image
- If a region is ambiguous or unreadable, omit it rather than guess
- Do not infer numbers from context (e.g., don't assume "x²" means exponent is "2" if "2" is not visible)

## Output Format
Return a single valid JSON object with this exact schema:
{
  "tokens": [
    {
      "text": "12",
      "role": "base",
      "bbox_norm": [0.1234, 0.2345, 0.1567, 0.2678],
      "confidence": 0.95
    }
  ]
}

If the image contains no numeric digits, return:
{ "tokens": [] }

## IMPORTANT
- Output ONLY the JSON object, no explanations, no markdown code fences
- Start your response with \`{\` and end with \`}\`
`;

/**
 * Vision座標検出用ユーザープロンプト
 */
export const VISION_USER_PROMPT =
  'Analyze this math worksheet image and detect all numeric digits with their precise bounding boxes. ' +
  'Return ONLY a JSON object starting with { containing the tokens array.';
