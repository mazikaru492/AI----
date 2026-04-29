# AI問題変換

問題作成を支援する Next.js アプリです。  
現在は、数学と英語の2つのシステムを切り替えて利用できます。

## 現在できること

| システム | 入力 | 処理内容 | 出力 |
|---|---|---|---|
| 数学 類題変換 | 数学問題の画像 | 画像内の数字を検出し、数字だけを置換 | 変換後の画像（PNGダウンロード） |
| 英語 単語穴埋めテスト | Excelファイル、単語範囲（A2:A50形式） | 範囲内の単語をランダム抽出し、例文・穴埋め文・4択を生成 | 問題シート（XLSXダウンロード） |

## 画面構成

### 1. システム選択画面

アプリを開くと最初にシステム選択画面が表示されます。  
選択可能な項目は `src/lib/systemRegistry.ts` の `SYSTEM_REGISTRY` で管理しています。

- 数学 類題変換
- 英語 単語穴埋めテスト

将来システムを増やす場合は、`SYSTEM_REGISTRY` に定義を1件追加するだけで、選択画面と遷移先の両方に反映されます。

### 2. 数学 類題変換

`src/components/systems/MathProblemSystem.tsx`

1. 画像を選択（カメラ撮影またはファイル選択）
2. 数字検出 API（`/api/detect`）で数値領域を取得
3. 画像上の数字を置換
4. 変換済み画像をダウンロード

補足:

- 画像サイズが大きい場合は自動圧縮してから検出します。
- 数字が検出できない場合はエラーメッセージを表示します。
- Supabase が設定されている場合、使用量と履歴を保存します。

### 3. 英語 単語穴埋めテスト

`src/components/systems/EnglishWordTestSystem.tsx`  
`src/app/api/english-word-test/route.ts`

1. Excel ファイルを選択
2. 単語範囲を指定（例: `A2:A50`）
3. 必要ならシート名を指定（未指定時は先頭シート）
4. 出題数を指定して生成実行
5. 問題シートを XLSX でダウンロード

サーバー側の処理:

- 指定範囲から単語を読み取り
- 重複を除外
- 指定数をランダム抽出
- Gemini で以下を生成
  - 例文（Sentence）
  - 穴埋め文（Blank）
  - 4択（Choices）
  - 正解（Answer）
- 結果を `WordTest` シートとして Excel 出力

出力列:

- `No`
- `Word`
- `Sentence`
- `Blank`
- `Choices`
- `Answer`

主な入力制約:

- 範囲は `A2:A50` 形式
- 範囲サイズは 2000 セル以下
- 出題数は 1〜50
- シート未存在や空範囲はエラー

## セットアップ

### 前提

- Node.js 20 以上を推奨
- npm

### インストール

```bash
npm install
```

### 開発サーバー起動

```bash
npm run dev
```

ブラウザで `http://localhost:3000` を開いて動作確認します。

## 環境変数

`.env.local` に設定してください。

| 変数名 | 用途 | 必須 |
|---|---|---|
| `GOOGLE_GEMINI_API_KEY` または `GEMINI_API_KEY` | 英語テスト生成（Gemini） | 英語機能で必須 |
| `ZAI_API_KEY` | 数学画像の数字検出 API | 数学機能で必須 |
| `NEXT_PUBLIC_SUPABASE_URL` | 使用量・履歴の保存 | 任意 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 使用量・履歴の保存 | 任意 |
| `GOOGLE_GEMINI_MODEL` / `GEMINI_MODEL` | Gemini 利用モデルの上書き | 任意 |
| `MICROCMS_DRAFT_KEY` | 制作者情報取得 API | 任意 |

## npm scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```
