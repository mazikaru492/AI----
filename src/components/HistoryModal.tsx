"use client";

import { X } from "lucide-react";
import type { HistoryEntry } from "@/types";
import { HistoryList } from "@/components/HistoryList";

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: HistoryEntry[];
  onSelect: (entry: HistoryEntry) => void;
  isLoading?: boolean;
}

/**
 * 履歴モーダル — iOS 26 Liquid Glass
 * PC: 中央配置、max-w-lg、余裕のあるパディング
 * スマホ: ほぼフルスクリーン幅、下部シート
 */
export function HistoryModal({
  isOpen,
  onClose,
  history,
  onSelect,
  isLoading,
}: HistoryModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="liquid-overlay fixed inset-0 z-50 flex items-end md:items-start justify-center px-3 md:px-4 pb-4 md:pb-0 md:pt-16"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="liquid-panel animate-modalSlideUp w-full max-w-[calc(100%-8px)] md:max-w-lg rounded-t-[24px] rounded-b-none md:rounded-[28px] p-3.5 md:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm md:text-base font-semibold text-white drop-shadow-sm">
            変換履歴
            {!isLoading && history.length > 0 && (
              <span className="ml-1.5 md:ml-2 text-[10px] md:text-xs font-normal text-white/60">
                ({history.length}件)
              </span>
            )}
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

        <div className="mt-2.5 md:mt-3 max-h-[55dvh] md:max-h-[65dvh] overflow-auto">
          <HistoryList
            history={history}
            isLoading={isLoading}
            onSelect={(entry) => {
              onSelect(entry);
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}
