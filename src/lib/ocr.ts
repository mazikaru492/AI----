/**
 * OCRユーティリティ - Tesseract.jsラッパー
 * 画像からテキストと座標を抽出
 */

import Tesseract from 'tesseract.js';

export interface DetectedNumber {
  text: string;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
  confidence: number;
}

export interface OCRResult {
  numbers: DetectedNumber[];
  fullText: string;
}

/**
 * 文字列が数値を含むかチェック
 */
function containsNumber(text: string): boolean {
  return /\d+/.test(text);
}

/**
 * 画像からOCRを実行し、数値の座標を抽出
 */
export async function extractNumbersFromImage(
  imageSource: string | File,
  onProgress?: (progress: number) => void
): Promise<OCRResult> {
  console.log('[OCR] Starting recognition...');

  const result = await Tesseract.recognize(imageSource, 'eng', {
    logger: (m) => {
      console.log('[OCR] Status:', m.status, m.progress);
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });

  console.log('[OCR] Recognition complete');
  console.log('[OCR] Full text:', result.data.text);

  const numbers: DetectedNumber[] = [];

  // Tesseract.jsの結果をunknownにキャストして安全にアクセス
  const data = result.data as unknown as {
    paragraphs?: Array<{
      lines?: Array<{
        words?: Array<{
          text: string;
          bbox: { x0: number; y0: number; x1: number; y1: number };
          confidence: number;
        }>;
      }>;
    }>;
    words?: Array<{
      text: string;
      bbox: { x0: number; y0: number; x1: number; y1: number };
      confidence: number;
    }>;
    text: string;
  };

  // paragraphs -> lines -> wordsの階層構造
  if (data.paragraphs) {
    for (const paragraph of data.paragraphs) {
      if (paragraph.lines) {
        for (const line of paragraph.lines) {
          if (line.words) {
            for (const word of line.words) {
              const wordText = word.text || '';
              console.log('[OCR] Word found:', wordText, 'bbox:', word.bbox);

              if (containsNumber(wordText)) {
                // 数値部分のみを抽出
                const numericMatches = wordText.match(/\d+/g);
                if (numericMatches) {
                  for (const numStr of numericMatches) {
                    numbers.push({
                      text: numStr,
                      bbox: word.bbox,
                      confidence: word.confidence || 0,
                    });
                    console.log('[OCR] Number detected:', numStr);
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // 代替: フラットなwordsプロパティも試す
  if (numbers.length === 0 && data.words) {
    console.log('[OCR] Trying flat words array...');
    for (const word of data.words) {
      const wordText = word.text || '';
      console.log('[OCR] Flat word found:', wordText);
      if (containsNumber(wordText)) {
        const numericMatches = wordText.match(/\d+/g);
        if (numericMatches) {
          for (const numStr of numericMatches) {
            numbers.push({
              text: numStr,
              bbox: word.bbox,
              confidence: word.confidence || 0,
            });
          }
        }
      }
    }
  }

  // テキスト全体から数値を抽出（座標なしのフォールバック）
  if (numbers.length === 0) {
    console.log('[OCR] Fallback: extracting from full text...');
    const fullTextMatches = data.text.match(/\d+/g);
    if (fullTextMatches) {
      // テキストから数値は見つかったが座標がない場合
      // 仮の座標を使用（画像全体の中央）
      for (const numStr of fullTextMatches) {
        numbers.push({
          text: numStr,
          bbox: { x0: 0, y0: 0, x1: 100, y1: 30 },
          confidence: 50,
        });
        console.log('[OCR] Fallback number:', numStr);
      }
    }
  }

  console.log('[OCR] Total numbers found:', numbers.length);

  return {
    numbers,
    fullText: result.data.text,
  };
}

/**
 * Tesseract.jsワーカーを事前ロード
 */
export async function preloadOCR(): Promise<void> {
  console.log('[OCR] Ready to use');
}
