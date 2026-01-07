/**
 * 画像圧縮ユーティリティ
 * Vercel 4.5MB制限とGemini API最適化のための画像圧縮処理
 */

import imageCompression from "browser-image-compression";

/** Vercelのリクエストボディ制限（約4.5MB）を考慮した上限（bytes） */
export const MAX_IMAGE_UPLOAD_BYTES = Math.floor(4.5 * 1024 * 1024);

/** 画像圧縮オプション */
export const IMAGE_COMPRESSION_OPTIONS = {
  /** 最大ファイルサイズ（MB） - Vercel制限を考慮 */
  maxSizeMB: 1,
  /** 最大幅または高さ（px） */
  maxWidthOrHeight: 2048,
  /** WebWorkerを使用して非同期処理 */
  useWebWorker: true,
} as const;

type ImageCompressionOptions = NonNullable<
  Parameters<typeof imageCompression>[1]
>;

async function compressWithOptions(
  file: File,
  options: ImageCompressionOptions
) {
  const compressed = await imageCompression(file, options);
  return compressed as File;
}

/**
 * 画像ファイルを圧縮する
 * @param file 圧縮する画像ファイル
 * @returns 圧縮された画像ファイル
 * @throws 圧縮に失敗した場合
 */
export async function compressImage(file: File): Promise<File> {
  try {
    // 1st pass: standard options
    let current = await compressWithOptions(file, IMAGE_COMPRESSION_OPTIONS);

    // If still too large, retry with stricter maxSizeMB (still using the same library)
    // NOTE: maxSizeMB is a soft target; file.size is the final source of truth.
    let attempt = 0;
    let maxSizeMB: number = IMAGE_COMPRESSION_OPTIONS.maxSizeMB;
    while (current.size > MAX_IMAGE_UPLOAD_BYTES && attempt < 2) {
      attempt += 1;
      maxSizeMB = Math.max(0.2, maxSizeMB * 0.6);
      current = await compressWithOptions(current, {
        ...IMAGE_COMPRESSION_OPTIONS,
        maxSizeMB,
      });
    }

    if (current.size > MAX_IMAGE_UPLOAD_BYTES) {
      throw new Error("compressed image is still too large");
    }

    return current;
  } catch (error) {
    console.warn("[imageCompression] compression failed", error);
    throw new Error(
      "画像の最適化に失敗しました。別の画像でもう一度お試しください。"
    );
  }
}
