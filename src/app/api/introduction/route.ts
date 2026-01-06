import { NextResponse } from "next/server";
import { getIntroduction } from "@/lib/microcms";
import type { Introduction } from "@/types/introduction";

export const runtime = "nodejs";

function isIntroduction(value: unknown): value is Introduction {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.name !== "string") return false;
  if (typeof v.zikosyoukai !== "string") return false;
  if (!v.image || typeof v.image !== "object") return false;
  const img = v.image as Record<string, unknown>;
  if (typeof img.url !== "string") return false;
  return true;
}

function extractIntroduction(data: unknown): Introduction {
  // microCMSのAPIは「単体（オブジェクト型）」と「一覧（contents配列）」で返却形式が異なる。
  // どちらでもフロントが扱えるように、ここで必ずIntroduction単体に正規化する。
  if (isIntroduction(data)) return data;

  if (data && typeof data === "object" && "contents" in data) {
    const contents = (data as { contents?: unknown }).contents;
    if (Array.isArray(contents) && contents.length > 0) {
      const first = contents[0];
      if (isIntroduction(first)) return first;
    }
  }

  throw new Error(
    "microCMSの応答形式が想定と異なります。APIスキーマ(フィールドID)とコンテンツ種別(一覧/単体)を確認してください。"
  );
}

export async function GET() {
  try {
    const draftKey = process.env.MICROCMS_DRAFT_KEY ?? "";

    const raw = (await getIntroduction(
      draftKey ? { draftKey } : undefined
    )) as unknown;
    const intro = extractIntroduction(raw);

    return NextResponse.json(intro);
  } catch (error) {
    console.error("[microCMS] introduction fetch error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
