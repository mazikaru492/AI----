import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as XLSX from "xlsx";
import { GEMINI_MODEL_LIST } from "@/lib/gemini";
import { getFallbackDecision } from "@/lib/modelFallback";

export const runtime = "nodejs";

interface WordTestItem {
  word: string;
  sentence: string;
  blankSentence: string;
  choices: string[];
  answer: string;
}

const MAX_RANGE_CELL_COUNT = 2000;

function getApiKey(): string {
  const key = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "GOOGLE_GEMINI_API_KEY or GEMINI_API_KEY is not set. Add it to .env.local or Vercel Environment Variables",
    );
  }
  return key;
}

function normalizeRange(raw: string): string {
  const trimmed = raw.trim().toUpperCase();
  if (!/^[A-Z]+[1-9]\d*:[A-Z]+[1-9]\d*$/.test(trimmed)) {
    throw new Error("range は A2:A50 の形式で指定してください。");
  }
  return trimmed;
}

function normalizeWord(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text;
}

function extractWordsFromRange(
  sheet: XLSX.WorkSheet,
  rangeA1: string,
): string[] {
  const decoded = XLSX.utils.decode_range(rangeA1);
  const words: string[] = [];

  for (let row = decoded.s.r; row <= decoded.e.r; row += 1) {
    for (let col = decoded.s.c; col <= decoded.e.c; col += 1) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = sheet[cellAddress];
      const normalized = normalizeWord(cell?.v);
      if (normalized) {
        words.push(normalized);
      }
    }
  }

  return [...new Set(words)];
}

function pickRandomWords(words: string[], count: number): string[] {
  const shuffled = [...words];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = tmp;
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

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

function parseWordTestItems(
  rawText: string,
  expectedWords: string[],
): WordTestItem[] {
  const cleaned = stripCodeFences(rawText)
    .trim()
    .replace(/\uFEFF/g, "")
    .replace(/[\u200B-\u200D\u2060]/g, "");

  const candidates: string[] = [cleaned];
  const extracted = extractJsonArraySubstring(cleaned);
  if (extracted && extracted !== cleaned) candidates.push(extracted);

  let parsedItems: unknown = null;
  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      parsedItems = JSON.parse(candidate);
      break;
    } catch (e) {
      lastError = e;
    }
  }

  if (!Array.isArray(parsedItems)) {
    const message =
      lastError instanceof Error ? lastError.message : "JSON parse failed";
    throw new Error(message);
  }

  const validated = parsedItems.map((item) => {
    if (
      typeof item !== "object" ||
      !item ||
      typeof (item as { word?: unknown }).word !== "string" ||
      typeof (item as { sentence?: unknown }).sentence !== "string" ||
      typeof (item as { blankSentence?: unknown }).blankSentence !== "string" ||
      !Array.isArray((item as { choices?: unknown[] }).choices) ||
      typeof (item as { answer?: unknown }).answer !== "string"
    ) {
      throw new Error("Word test item structure is invalid");
    }

    const typed = item as WordTestItem;
    const cleanedAnswer = typed.answer.trim();
    const cleanedChoices = typed.choices.map((choice) => String(choice).trim());
    if (cleanedChoices.length !== 4) {
      throw new Error("choices must contain exactly 4 items");
    }
    if (!cleanedChoices.includes(cleanedAnswer)) {
      throw new Error("choices must include the answer");
    }
    return {
      ...typed,
      word: typed.word.trim(),
      sentence: typed.sentence.trim(),
      blankSentence: typed.blankSentence.trim(),
      answer: cleanedAnswer,
      choices: cleanedChoices,
    };
  });

  const map = new Map(
    validated.map((item) => [item.word.toLowerCase(), item] as const),
  );

  const ordered = expectedWords.map((word) => {
    const found = map.get(word.toLowerCase());
    if (!found) {
      throw new Error(`Missing generated item for word: ${word}`);
    }
    return found;
  });

  return ordered;
}

function buildPrompt(words: string[]): string {
  return `
以下の英単語リストから穴埋め単語テストを作成してください。

ルール:
- 各単語につき1問、合計 ${words.length} 問を作る
- sentence: 単語を自然に使った英語例文
- blankSentence: sentence の対象単語だけを ____ に置換
- choices: 4つの選択肢（正解1つ + 誤答3つ）
- answer: 正解単語
- word と answer は与えられた単語をそのまま使う
- 返す順序は入力単語の順番を維持

出力はJSON配列のみ:
[
  {
    "word": "example",
    "sentence": "I use this as an example.",
    "blankSentence": "I use this as an ____.",
    "choices": ["example", "excuse", "sample", "lesson"],
    "answer": "example"
  }
]

対象単語:
${JSON.stringify(words, null, 2)}
`.trim();
}

function buildWorkbookBuffer(items: WordTestItem[]): Uint8Array {
  const rows = items.map((item, index) => ({
    No: index + 1,
    Word: item.word,
    Sentence: item.sentence,
    Blank: item.blankSentence,
    Choices: item.choices.join(" / "),
    Answer: item.answer,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 6 },
    { wch: 20 },
    { wch: 52 },
    { wch: 52 },
    { wch: 36 },
    { wch: 20 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "WordTest");

  const workbookArray = XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
  }) as ArrayBuffer;
  return new Uint8Array(workbookArray);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const excelFile = formData.get("excel");
    const rangeInput = String(formData.get("range") ?? "");
    const sheetNameInput = String(formData.get("sheetName") ?? "").trim();
    const countInput = Number(formData.get("questionCount") ?? 10);
    const questionCount = Number.isFinite(countInput)
      ? Math.max(1, Math.min(50, Math.floor(countInput)))
      : 10;

    if (!(excelFile instanceof File)) {
      return NextResponse.json(
        { error: "excel file is required (field name: excel)" },
        { status: 400 },
      );
    }

    let normalizedRange = "";
    try {
      normalizedRange = normalizeRange(rangeInput);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid range";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const fileBytes = await excelFile.arrayBuffer();
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(Buffer.from(fileBytes), { type: "buffer" });
    } catch {
      return NextResponse.json(
        { error: "Excelファイルの読み込みに失敗しました。" },
        { status: 400 },
      );
    }
    if (workbook.SheetNames.length === 0) {
      return NextResponse.json(
        { error: "Excelにシートが見つかりませんでした。" },
        { status: 400 },
      );
    }

    if (sheetNameInput && !workbook.SheetNames.includes(sheetNameInput)) {
      return NextResponse.json(
        { error: `指定シート '${sheetNameInput}' が見つかりません。` },
        { status: 400 },
      );
    }

    const targetSheetName = sheetNameInput || workbook.SheetNames[0];
    const sheet = workbook.Sheets[targetSheetName];
    if (!sheet) {
      return NextResponse.json(
        { error: "指定シートの読み込みに失敗しました。" },
        { status: 400 },
      );
    }

    const decodedRange = XLSX.utils.decode_range(normalizedRange);
    const rangeCellCount =
      (decodedRange.e.r - decodedRange.s.r + 1) *
      (decodedRange.e.c - decodedRange.s.c + 1);
    if (rangeCellCount > MAX_RANGE_CELL_COUNT) {
      return NextResponse.json(
        {
          error: `範囲が大きすぎます。${MAX_RANGE_CELL_COUNT}セル以下で指定してください。`,
        },
        { status: 400 },
      );
    }

    const words = extractWordsFromRange(sheet, normalizedRange);
    if (words.length === 0) {
      return NextResponse.json(
        { error: "指定範囲に有効な単語が見つかりませんでした。" },
        { status: 400 },
      );
    }

    const selectedWords = pickRandomWords(words, questionCount);
    const apiKey = getApiKey();
    const genAI = new GoogleGenerativeAI(apiKey);

    let allFallbackable = true;
    let allNotFound = true;
    let sawRateLimit = false;

    for (const modelName of GEMINI_MODEL_LIST) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction:
            "あなたは中学生向け英語テスト作成AIです。出力はJSON配列のみで返してください。",
        });

        const result = await model.generateContent({
          contents: [
            { role: "user", parts: [{ text: buildPrompt(selectedWords) }] },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.4,
          },
        });

        const text = result.response.text();
        const generatedItems = parseWordTestItems(text, selectedWords);
        const workbookBuffer = buildWorkbookBuffer(generatedItems);
        const fileName = `english-word-test-${Date.now()}.xlsx`;

        return new NextResponse(workbookBuffer, {
          status: 200,
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
            "X-Question-Count": String(generatedItems.length),
          },
        });
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        const decision = getFallbackDecision(error);
        if (!decision.shouldFallback) {
          allFallbackable = false;
        }
        if (!decision.isNotFound) {
          allNotFound = false;
        }
        if (decision.isRateLimit) {
          sawRateLimit = true;
        }
        if (decision.shouldFallback) {
          continue;
        }
        throw error;
      }
    }

    if (allNotFound) {
      return NextResponse.json(
        {
          error:
            "利用可能なモデルが見つかりませんでした。モデル設定を確認してください。",
        },
        { status: 404 },
      );
    }

    if (allFallbackable && sawRateLimit) {
      return NextResponse.json(
        {
          error:
            "現在モデルの利用制限に達しています。しばらく待ってから再試行してください。",
        },
        { status: 429 },
      );
    }

    if (allFallbackable) {
      return NextResponse.json(
        { error: "現在英語テスト生成サービスを利用できません。" },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        error:
          "英語テストの生成に失敗しました。時間をおいて再試行してください。",
      },
      { status: 500 },
    );
  } catch (error) {
    console.error("[English Word Test API Error]", error);
    return NextResponse.json(
      {
        error:
          "英語テストの生成に失敗しました。時間をおいて再試行してください。",
      },
      { status: 500 },
    );
  }
}
