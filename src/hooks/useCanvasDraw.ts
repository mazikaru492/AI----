'use client';

import { useCallback, useRef, type RefObject } from 'react';
import type { NumberReplacement } from '@/types';
import {
  replaceNumbersOnCanvas,
  drawImageToCanvas,
  canvasToBlob,
} from '@/lib/canvasUtils';

/**
 * Canvas描画操作を管理するカスタムフック
 * パフォーマンス最適化のためuseRefを活用
 */
export function useCanvasDraw(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  originalImageRef: RefObject<HTMLImageElement | null>,
  maxWidth: number = 600
) {
  const scaleRef = useRef<number>(1);
  const dimensionsRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  /**
   * 画像をCanvasに描画
   */
  const loadImage = useCallback(
    async (imageFile: File): Promise<{ width: number; height: number; scale: number }> => {
      if (!canvasRef.current) throw new Error('Canvas not ready');

      const img = new Image();
      img.src = URL.createObjectURL(imageFile);

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
      });

      // originalImageRefを更新（親から渡されたref）
      if (originalImageRef) {
        (originalImageRef as React.MutableRefObject<HTMLImageElement | null>).current = img;
      }

      const { scale } = drawImageToCanvas(canvasRef.current, img, maxWidth);
      scaleRef.current = scale;
      dimensionsRef.current = { width: img.naturalWidth, height: img.naturalHeight };

      return { width: img.naturalWidth, height: img.naturalHeight, scale };
    },
    [canvasRef, originalImageRef, maxWidth]
  );

  /**
   * 置換数値をCanvasに描画
   */
  const drawReplacements = useCallback(
    (replacements: NumberReplacement[]) => {
      if (canvasRef.current && originalImageRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          drawImageToCanvas(canvasRef.current, originalImageRef.current, maxWidth);
          replaceNumbersOnCanvas(ctx, replacements);
        }
      }
    },
    [canvasRef, originalImageRef, maxWidth]
  );

  /**
   * Canvasを元画像にリセット
   */
  const reset = useCallback(() => {
    if (canvasRef.current && originalImageRef.current) {
      drawImageToCanvas(canvasRef.current, originalImageRef.current, maxWidth);
    }
  }, [canvasRef, originalImageRef, maxWidth]);

  /**
   * CanvasをBase64文字列に変換
   */
  const toBase64 = useCallback((): string => {
    if (!canvasRef.current) return '';
    const dataUrl = canvasRef.current.toDataURL('image/png');
    return dataUrl.replace(/^data:image\/\w+;base64,/, '');
  }, [canvasRef]);

  /**
   * CanvasをBlobに変換
   */
  const toBlob = useCallback(
    async (type: string = 'image/png'): Promise<Blob> => {
      if (!canvasRef.current) throw new Error('Canvas not ready');
      return canvasToBlob(canvasRef.current, type);
    },
    [canvasRef]
  );

  /**
   * 現在のスケール値を取得
   */
  const getScale = useCallback(() => scaleRef.current, []);

  /**
   * 元画像のサイズを取得
   */
  const getDimensions = useCallback(() => dimensionsRef.current, []);

  return {
    loadImage,
    drawReplacements,
    reset,
    toBase64,
    toBlob,
    getScale,
    getDimensions,
  };
}
