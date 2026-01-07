'use client';

import { X } from 'lucide-react';
import Image from 'next/image';
import type { Introduction } from '@/types';

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">制作者の紹介</h2>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl hover:bg-zinc-50"
            onClick={onClose}
            aria-label="close"
          >
            <X className="h-5 w-5 text-zinc-700" />
          </button>
        </div>

        <div className="mt-4">
          {isLoading ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 animate-pulse rounded-full bg-zinc-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 animate-pulse rounded bg-zinc-200" />
                  <div className="h-3 w-28 animate-pulse rounded bg-zinc-200" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-3 w-full animate-pulse rounded bg-zinc-200" />
                <div className="h-3 w-[92%] animate-pulse rounded bg-zinc-200" />
                <div className="h-3 w-[88%] animate-pulse rounded bg-zinc-200" />
              </div>
            </div>
          ) : error ? (
            <div className="rounded-xl bg-zinc-50 p-3">
              <p className="text-sm font-medium text-red-600">{error}</p>
              <button
                type="button"
                className="mt-3 h-11 w-full rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white"
                onClick={onRetry}
              >
                再読み込み
              </button>
            </div>
          ) : introduction ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative h-14 w-14 overflow-hidden rounded-full ring-1 ring-black/5">
                  {introduction.image?.url ? (
                    <Image
                      src={introduction.image.url}
                      alt={introduction.name}
                      fill
                      className="object-cover"
                      sizes="56px"
                    />
                  ) : (
                    <div className="h-full w-full bg-zinc-200" />
                  )}
                </div>
                <div>
                  <p className="text-base font-semibold text-zinc-900">
                    {introduction.name}
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-zinc-600">
                    制作者プロフィール
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-zinc-50 p-3">
                <p className="whitespace-pre-wrap text-sm text-zinc-900">
                  {introduction.zikosyoukai}
                </p>
              </div>

              <button
                type="button"
                className="h-11 w-full rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white"
                onClick={onClose}
              >
                閉じる
              </button>
            </div>
          ) : (
            <div className="rounded-xl bg-zinc-50 p-3">
              <p className="text-sm text-zinc-600">読み込み準備中です。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
