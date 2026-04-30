"use client";

import { X } from "lucide-react";
import Image from "next/image";
import type { Introduction } from "@/types";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  introduction: Introduction | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}

/**
 * 制作者紹介モーダル — iOS 26 Liquid Glass
 * PC: 中央配置、max-w-lg
 * スマホ: ほぼフルスクリーン幅、下部シート
 */
export function ProfileModal({
  isOpen,
  onClose,
  introduction,
  isLoading,
  error,
  onRetry,
}: ProfileModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="liquid-overlay fixed inset-0 z-50 flex items-end md:items-center justify-center px-3 md:px-4 pb-4 md:pb-0"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="liquid-panel animate-modalSlideUp w-full max-w-[calc(100%-8px)] md:max-w-lg rounded-t-[24px] rounded-b-none md:rounded-[28px] p-4 md:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm md:text-base font-semibold text-white drop-shadow-sm">
            制作者の紹介
          </h2>
          <button
            type="button"
            className="liquid-button inline-flex h-8 w-8 md:h-9 md:w-9 items-center justify-center rounded-xl"
            onClick={onClose}
            aria-label="close"
          >
            <X className="h-4 w-4 md:h-5 md:w-5" />
          </button>
        </div>

        <div className="mt-3 md:mt-4">
          {isLoading ? (
            <div className="space-y-3 md:space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 md:h-14 md:w-14 animate-pulse rounded-full liquid-skeleton" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-36 md:w-40 liquid-skeleton" />
                  <div className="h-3 w-24 md:w-28 liquid-skeleton" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-3 w-full liquid-skeleton" />
                <div className="h-3 w-[92%] liquid-skeleton" />
                <div className="h-3 w-[88%] liquid-skeleton" />
              </div>
            </div>
          ) : error ? (
            <div
              className="liquid-panel-soft rounded-xl p-3"
              style={{ borderColor: "rgba(255, 59, 48, 0.3)" }}
            >
              <p className="text-xs md:text-sm font-medium text-red-200">
                {error}
              </p>
              <button
                type="button"
                className="liquid-button-primary mt-3 h-10 md:h-11 w-full rounded-xl px-4 text-xs md:text-sm font-semibold"
                onClick={onRetry}
              >
                再読み込み
              </button>
            </div>
          ) : introduction ? (
            <div className="space-y-3 md:space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative h-12 w-12 md:h-14 md:w-14 overflow-hidden rounded-full ring-2 ring-white/30">
                  {introduction.image?.url ? (
                    <Image
                      src={introduction.image.url}
                      alt={introduction.name}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 48px, 56px"
                    />
                  ) : (
                    <div className="h-full w-full liquid-skeleton" />
                  )}
                </div>
                <div>
                  <p className="text-sm md:text-base font-semibold text-white drop-shadow-sm">
                    {introduction.name}
                  </p>
                  <p className="mt-0.5 text-[10px] md:text-xs font-medium text-white/65">
                    制作者プロフィール
                  </p>
                </div>
              </div>

              <div className="liquid-panel-soft rounded-xl p-3">
                <p className="whitespace-pre-wrap text-xs md:text-sm text-white/90">
                  {introduction.zikosyoukai}
                </p>
              </div>

              <button
                type="button"
                className="liquid-button h-10 md:h-11 w-full rounded-xl px-4 text-xs md:text-sm font-semibold"
                onClick={onClose}
              >
                閉じる
              </button>
            </div>
          ) : (
            <div className="liquid-panel-soft rounded-xl p-3">
              <p className="text-xs md:text-sm text-white/65">
                読み込み準備中です。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
