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
