import {
  analyzeGlmOcrResponse,
  parseLatexTokens,
  type LatexToken,
} from "@/lib/glmOcrParser";
import type { CharBbox, DetectedNumber, TextRole } from "@/lib/smartErase";

const ZAI_API_URL = "https://api.z.ai/api/paas/v4/layout_parsing";
const GLM_OCR_MODEL = "glm-ocr";

interface GlmLayoutUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface GlmLayoutDetail {
  label?: string;
  bbox_2d?: unknown;
  content?: string;
}

interface GlmLayoutResponse {
  id?: string;
  md_results?: string;
  layout_details?: unknown;
  usage?: GlmLayoutUsage;
  error?: {
    code?: string;
    message?: string;
  };
}

export interface GlmOcrDetectionResult {
  numbers: DetectedNumber[];
  tokens: LatexToken[];
  rawText: string;
  usage?: GlmLayoutUsage;
  layoutDetailsCount: number;
}

interface RunGlmOcrDetectionInput {
  apiKey: string;
  imageBase64: string;
  mimeType: string;
  imageWidth: number;
  imageHeight: number;
}

const ROLE_PRIORITY: Partial<Record<TextRole, number>> = {
  "fraction-num": 10,
  "fraction-den": 10,
  "sqrt-content": 10,
  "lim-sub": 10,
  "sum-lower": 10,
  "sum-upper": 10,
  "int-lower": 10,
  "int-upper": 10,
  sup: 5,
  sub: 5,
  base: 1,
};

export async function runGlmOcrDetection(
  input: RunGlmOcrDetectionInput,
): Promise<GlmOcrDetectionResult> {
  const { apiKey, imageBase64, mimeType, imageWidth, imageHeight } = input;
  const fileDataUri = `data:${mimeType || "image/png"};base64,${imageBase64}`;

  const response = await fetch(ZAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GLM_OCR_MODEL,
      file: fileDataUri,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GLM-OCR API エラー (${response.status}): ${errorText}`);
  }

  const parsed = (await response.json()) as GlmLayoutResponse;
  if (parsed.error) {
    throw new Error(
      `GLM-OCR エラー: ${parsed.error.message ?? "unknown api error"}`,
    );
  }

  const rawContent =
    typeof parsed.md_results === "string" ? parsed.md_results : "";
  const { tokens, rawText } = analyzeGlmOcrResponse(rawContent);
  const layoutDetails = flattenLayoutDetails(parsed.layout_details);
  const globalRoleMap = buildRoleMapFromTokens(tokens);
  const seen = new Set<string>();
  const numbers: DetectedNumber[] = [];

  for (const detail of layoutDetails) {
    if (detail.label === "image") continue;
    if (typeof detail.content !== "string" || !detail.content) continue;

    const bbox = normalizeBbox(detail.bbox_2d);
    if (!bbox) continue;

    const roleMapInElement = buildRoleMapFromText(detail.content);
    const [x1, y1, x2, y2] = bbox;
    const elementX = Math.round(x1 * imageWidth);
    const elementY = Math.round(y1 * imageHeight);
    const elementWidth = Math.max(1, Math.round((x2 - x1) * imageWidth));
    const elementHeight = Math.max(1, Math.round((y2 - y1) * imageHeight));
    const contentLength = Math.max(detail.content.length, 1);

    for (const match of detail.content.matchAll(/[0-9０-９]{1,2}/g)) {
      if (typeof match.index !== "number") continue;

      const text = normalizeDigits(match[0]);
      const start = match.index;
      const end = start + match[0].length;
      const startRatio = clamp(start / contentLength, 0, 1);
      const endRatio = clamp(end / contentLength, 0, 1);
      const ratioWidth = Math.max(endRatio - startRatio, 1 / contentLength);

      const x = Math.round(elementX + elementWidth * startRatio);
      const y = elementY;
      const width = Math.max(1, Math.round(elementWidth * ratioWidth));
      const height = elementHeight;
      const role =
        roleMapInElement.get(text) ??
        globalRoleMap.get(text) ??
        ("base" as TextRole);

      const clamped = clampPixelBbox(
        { x, y, width, height },
        imageWidth,
        imageHeight,
      );
      const key = `${text}:${clamped.x}:${clamped.y}:${clamped.width}:${clamped.height}`;
      if (seen.has(key)) continue;
      seen.add(key);

      numbers.push({
        text,
        bbox: clamped,
        role,
        charBboxes: buildCharBboxes(text, clamped.x, clamped.width),
      });
    }
  }

  return {
    numbers,
    tokens,
    rawText,
    usage: parsed.usage,
    layoutDetailsCount: layoutDetails.length,
  };
}

function flattenLayoutDetails(raw: unknown): GlmLayoutDetail[] {
  if (!Array.isArray(raw)) return [];

  const flattened: GlmLayoutDetail[] = [];
  const queue: unknown[] = [...raw];

  while (queue.length > 0) {
    const item = queue.shift();
    if (Array.isArray(item)) {
      queue.push(...item);
      continue;
    }
    if (item && typeof item === "object") {
      flattened.push(item as GlmLayoutDetail);
    }
  }

  return flattened;
}

function normalizeBbox(raw: unknown): [number, number, number, number] | null {
  if (!Array.isArray(raw) || raw.length < 4) return null;
  const nums = raw.slice(0, 4).map((n) => Number(n));
  if (nums.some((n) => !Number.isFinite(n))) return null;

  const x1 = clamp(Math.min(nums[0], nums[2]), 0, 1);
  const y1 = clamp(Math.min(nums[1], nums[3]), 0, 1);
  const x2 = clamp(Math.max(nums[0], nums[2]), 0, 1);
  const y2 = clamp(Math.max(nums[1], nums[3]), 0, 1);

  if (x2 <= x1 || y2 <= y1) return null;
  return [x1, y1, x2, y2];
}

function buildRoleMapFromText(text: string): Map<string, TextRole> {
  return buildRoleMapFromTokens(parseLatexTokens(text));
}

function buildRoleMapFromTokens(tokens: LatexToken[]): Map<string, TextRole> {
  const map = new Map<string, TextRole>();

  for (const token of tokens) {
    const role = token.role as TextRole;
    const existing = map.get(token.text);
    const existingPriority = existing ? (ROLE_PRIORITY[existing] ?? 0) : 0;
    const nextPriority = ROLE_PRIORITY[role] ?? 1;
    if (nextPriority > existingPriority) {
      map.set(token.text, role);
    }
  }

  return map;
}

function buildCharBboxes(
  text: string,
  startX: number,
  totalWidth: number,
): CharBbox[] | undefined {
  if (text.length <= 1) return undefined;

  const charWidth = totalWidth / text.length;
  return text.split("").map((char, index) => ({
    char,
    xmin: Math.round(startX + charWidth * index),
    xmax: Math.round(startX + charWidth * (index + 1)),
  }));
}

function normalizeDigits(text: string): string {
  return text.replace(/[０-９]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xff10 + 0x30),
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampPixelBbox(
  bbox: { x: number; y: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number,
): { x: number; y: number; width: number; height: number } {
  const x = clamp(Math.round(bbox.x), 0, Math.max(0, imageWidth - 1));
  const y = clamp(Math.round(bbox.y), 0, Math.max(0, imageHeight - 1));
  const width = clamp(Math.round(bbox.width), 1, Math.max(1, imageWidth - x));
  const height = clamp(
    Math.round(bbox.height),
    1,
    Math.max(1, imageHeight - y),
  );
  return { x, y, width, height };
}
