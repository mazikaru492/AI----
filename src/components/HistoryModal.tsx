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
 * 履歴モーダル
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
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-16"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">
            変換履歴
            {!isLoading && history.length > 0 && (
              <span className="ml-2 text-xs font-normal text-zinc-400">
                ({history.length}件)
              </span>
            )}
          </h2>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl hover:bg-zinc-50"
            onClick={onClose}
            aria-label="close"
          >
            <X className="h-5 w-5 text-zinc-700" />
          </button>
        </div>

        <div className="mt-3 max-h-[60dvh] overflow-auto">
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
