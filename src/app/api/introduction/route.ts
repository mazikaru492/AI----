import { NextResponse } from "next/server";
import { getIntroduction } from "@/lib/microcms";

export const runtime = "nodejs";

export async function GET() {
  try {
    const draftKey = process.env.MICROCMS_DRAFT_KEY ?? "";

    const data = await getIntroduction(draftKey ? { draftKey } : undefined);

    return NextResponse.json(data);
  } catch (error) {
    console.error("[microCMS] introduction fetch error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
