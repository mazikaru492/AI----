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
 * 制作者紹介モーダル
 * Liquid Glass ダークテーマ対応
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
      className="liquid-overlay fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="liquid-panel animate-modalSlideUp w-full max-w-md rounded-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            制作者の紹介
          </h2>
          <button
            type="button"
            className="liquid-button inline-flex h-9 w-9 items-center justify-center rounded-xl"
            onClick={onClose}
            aria-label="close"
          >
            <X className="h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        <div className="mt-4">
          {isLoading ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 animate-pulse rounded-full liquid-skeleton" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 liquid-skeleton" />
                  <div className="h-3 w-28 liquid-skeleton" />
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
              style={{ borderColor: 'var(--danger-soft)' }}
            >
              <p className="text-sm font-medium" style={{ color: '#f87171' }}>{error}</p>
              <button
                type="button"
                className="liquid-button-primary mt-3 h-11 w-full rounded-xl px-4 text-sm font-semibold"
                onClick={onRetry}
              >
                再読み込み
              </button>
            </div>
          ) : introduction ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div
                  className="relative h-14 w-14 overflow-hidden rounded-full"
                  style={{
                    boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.1)',
                  }}
                >
                  {introduction.image?.url ? (
                    <Image
                      src={introduction.image.url}
                      alt={introduction.name}
                      fill
                      className="object-cover"
                      sizes="56px"
                    />
                  ) : (
                    <div className="h-full w-full liquid-skeleton" />
                  )}
                </div>
                <div>
                  <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {introduction.name}
                  </p>
                  <p className="mt-0.5 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    制作者プロフィール
                  </p>
                </div>
              </div>

              <div className="liquid-panel-soft rounded-xl p-3">
                <p className="whitespace-pre-wrap text-sm" style={{ color: 'var(--text-primary)' }}>
                  {introduction.zikosyoukai}
                </p>
              </div>

              <button
                type="button"
                className="liquid-button h-11 w-full rounded-xl px-4 text-sm font-semibold"
                onClick={onClose}
              >
                閉じる
              </button>
            </div>
          ) : (
            <div className="liquid-panel-soft rounded-xl p-3">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                読み込み準備中です。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
