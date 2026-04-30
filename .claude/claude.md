CLAUDE.md
Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

Tradeoff: These guidelines bias toward caution over speed. For trivial tasks, use judgment.

1. Think Before Coding
   Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

State your assumptions explicitly. If uncertain, ask.
If multiple interpretations exist, present them - don't pick silently.
If a simpler approach exists, say so. Push back when warranted.
If something is unclear, stop. Name what's confusing. Ask. 2. Simplicity First
Minimum code that solves the problem. Nothing speculative.

No features beyond what was asked.
No abstractions for single-use code.
No "flexibility" or "configurability" that wasn't requested.
No error handling for impossible scenarios.
If you write 200 lines and it could be 50, rewrite it.
Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

3. Surgical Changes
   Touch only what you must. Clean up only your own mess.

When editing existing code:

Don't "improve" adjacent code, comments, or formatting.
Don't refactor things that aren't broken.
Match existing style, even if you'd do it differently.
If you notice unrelated dead code, mention it - don't delete it.
When your changes create orphans:

Remove imports/variables/functions that YOUR changes made unused.
Don't remove pre-existing dead code unless asked.
The test: Every changed line should trace directly to the user's request.

4. Goal-Driven Execution
   Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

"Add validation" → "Write tests for invalid inputs, then make them pass"
"Fix the bug" → "Write a test that reproduces it, then make it pass"
"Refactor X" → "Ensure tests pass before and after"
For multi-step tasks, state a brief plan:

1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
   Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

These guidelines are working if: fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come

---

## Project-Specific: AI問題変換 (ai-problem-converter)

**For detailed project information, refer to [README.md](../README.md)**

### Quick Reference

- **Tech Stack**: Next.js 16, TypeScript, React 19, Tailwind CSS v4, Gemini API, Supabase, MicroCMS
- **Architecture**: App Router (`src/app/`), Server Components, API Routes
- **Key APIs**: Google Gemini API, GLM-OCR (ZAI API), Supabase, MicroCMS
- **Hosting**: Vercel

### Critical Do's & Don'ts

✅ **DO:**

- Use TypeScript strict mode
- Store secrets in `.env.local` (never commit)
- Use Server Components by default; use `"use client"` only when necessary
- Follow the component structure in `src/components/`
- Use utility functions in `src/lib/` for logic sharing

❌ **DON'T:**

- Commit `.env.local` or API keys
- Use `any` type without clear reason
- Mix Pages Router with App Router
- Direct manipulation of DOM in React components unless absolutely necessary (use Refs)
- Forget to update `README.md` for major functional changes

## 1. プロジェクト概要

**学校や塾での問題作成をAIで補助するNext.jsアプリ。数学の類題変換（画像内の数字置換）と英語の単語穴埋めテスト生成の2つの主要機能を備える。Gemini APIやGLM-OCRを活用し、学習効率の向上を支援。**

### 技術スタック

| 項目                       | 選択肢                                 |
| -------------------------- | -------------------------------------- |
| **フレームワーク**         | Next.js 16 (App Router)                |
| **言語**                   | TypeScript / Python (生成スクリプト等) |
| **UI**                     | React 19                               |
| **スタイリング**           | Tailwind CSS v4                        |
| **データベース/認証**      | Supabase                               |
| **AI/OCR API**             | Gemini API, GLM-OCR (ZAI API)          |
| **CMS**                    | MicroCMS (制作者情報用)                |
| **パッケージマネージャー** | npm                                    |
| **Node バージョン**        | >=20                                   |

### 主要機能

- **数学 類題変換**: 問題画像内の数字を検出し、自動で置換した類題画像を生成。
- **英語 単語穴埋めテスト**: Excel/CSVから単語を抽出し、例文付きの単語テスト(XLSX)を自動生成。
- **共通基盤**: システム切り替え、利用履歴表示、利用回数制限（Supabase連携時）。
- **PDF出力**: 生成した問題のPDFダウンロード機能。

---

## 2. ディレクトリマップ

```
AI問題変換/
├── .claude/
│   └── claude.md                    # Claude Code 行動ガイドライン
├── src/
│   ├── app/                         # App Router ディレクトリ
│   │   ├── globals.css              # グローバルスタイル
│   │   ├── layout.tsx               # ルートレイアウト
│   │   ├── page.tsx                 # トップページ（システム選択）
│   │   └── api/                     # API ルート
│   │       ├── analyze/             # 解析用
│   │       ├── generate/            # 問題生成用
│   │       ├── glm-ocr/             # OCR連携
│   │       └── ...                  # 各種機能用エンドポイント
│   ├── components/                  # React コンポーネント
│   │   ├── systems/                 # 各システム（数学/英語）のメイン画面
│   │   │   ├── MathProblemSystem.tsx
│   │   │   └── EnglishWordTestSystem.tsx
│   │   ├── ui/                      # 共通UIパーツ
│   │   ├── AppShell.tsx             # 全体レイアウト
│   │   └── ...                      # 機能別コンポーネント (CanvasEditor, History等)
│   ├── lib/                         # ロジック・ユーティリティ
│   │   ├── gemini.ts                # Gemini API 連携
│   │   ├── glmOcrParser.ts          # OCR結果パース
│   │   ├── mathRenderer.ts          # 数学描画ロジック
│   │   └── supabase.ts              # Supabase クライアント
│   ├── types/                       # TypeScript 型定義
│   └── hooks/                       # カスタムフック (LocalStorage, API利用状況等)
├── public/                          # 静的アセット
├── math_problem_generator.py        # 数学問題生成スクリプト
├── .env.local                       # 環境変数（非公開）
├── package.json
└── README.md
```

### 主要ディレクトリの役割

| ディレクトリ      | 説明                                                                      |
| ----------------- | ------------------------------------------------------------------------- |
| `src/app/`        | Next.js App Router。ページ遷移とAPIルートを管理                           |
| `src/components/` | UIコンポーネント。`systems/` 内に主要なビジネスロジックUIが集約されている |
| `src/lib/`        | API連携、画像処理、数学描画、DB連携などのコアロジック                     |
| `src/types/`      | プロジェクト全体で使用する共通の型定義                                    |
| `src/api/`        | バックエンド処理（Gemini, OCR, Supabaseとのやり取り）                     |

---

## 3. 禁止事項（Critical Rules）

### ⛔ 絶対にやってはいけないこと

#### 3.1 環境変数・認証情報の露出

**禁止行為：**

- `.env.local` をコミットする
- API キー（Gemini, ZAI, Supabase, MicroCMS）をコード内にハードコードする
- 認証情報をログ（`console.log`）に出力し、そのまま公開環境に残す

**正しいやり方：**

- 環境変数は `process.env.*` で参照し、ローカルでは `.env.local` を使用する
- クライアントサイドで必要な場合は `NEXT_PUBLIC_` プレフィックスを付けるが、セキュリティに注意する
- CI/CD ではプラットフォーム（Vercel等）の環境変数設定を使用する
