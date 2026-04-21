"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { HistoryEntry } from "@/types";
import { useApiUsage } from "@/hooks/useApiUsage";
import { supabase } from "@/lib/supabase";
import type { ConversionHistoryRow } from "@/lib/supabase";
import { Navbar } from "./Navbar";
import { HistoryModal } from "./HistoryModal";
import { ProfileModal } from "./ProfileModal";

// =====================================
// Context
// =====================================

interface AppShellContextValue {
  openHistory: () => void;
  openCreator: () => void;
  addHistoryEntry: (entry: HistoryEntry) => void;
  selectedHistoryEntry: HistoryEntry | null;
  clearSelectedHistoryEntry: () => void;
  incrementApiUsage: () => void;
  apiUsage: {
    count: number;
    limit: number;
    hydrated: boolean;
  };
}

const AppShellContext = createContext<AppShellContextValue | null>(null);

export function useAppShell() {
  const value = useContext(AppShellContext);
  return value ?? undefined;
}

// =====================================
// Helpers
// =====================================

/** Supabase の行データを HistoryEntry に変換 */
function rowToEntry(row: ConversionHistoryRow): HistoryEntry {
  return {
    id: row.id,
    createdAt: new Date(row.created_at).toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
    summary: row.summary,
    numbersDetected: row.numbers_detected,
  };
}

// =====================================
// Component
// =====================================

export function AppShell({ children }: { children: React.ReactNode }) {
  // Modal state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);

  // API usage tracking (Supabase 対応済み)
  const apiUsage = useApiUsage();

  // 履歴 state（Supabase から取得）
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedHistoryEntry, setSelectedHistoryEntry] =
    useState<HistoryEntry | null>(null);

  // Introduction state
  const [introduction, setIntroduction] = useState<{
    name: string;
    zikosyoukai: string;
    image: { url: string };
  } | null>(null);
  const [introLoading, setIntroLoading] = useState(false);
  const [introError, setIntroError] = useState<string | null>(null);

  // --- 履歴をSupabaseから取得 ---
  const loadHistory = useCallback(async () => {
    if (historyLoading) return;
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from("conversion_history")
        .select("id, created_at, summary, numbers_detected")
        .order("created_at", { ascending: false })
        .limit(50)
        .returns<ConversionHistoryRow[]>();

      if (error) {
        console.warn("[AppShell] history fetch failed:", error.message);
        return;
      }
      setHistory((data ?? []).map(rowToEntry));
    } catch (e) {
      console.warn("[AppShell] history unexpected error:", e);
    } finally {
      setHistoryLoading(false);
    }
  }, [historyLoading]);

  // 初回マウント時に履歴を取得
  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- 新しい履歴エントリをSupabaseに保存 ---
  const addHistoryEntry = useCallback(async (entry: HistoryEntry) => {
    // 楽観的 UI: 先にローカルに追加
    setHistory((prev) => [entry, ...prev]);

    try {
      const { error } = await supabase.from("conversion_history").insert({
        id: entry.id,
        summary: entry.summary,
        numbers_detected: entry.numbersDetected,
      });
      if (error) {
        console.warn("[AppShell] history insert failed:", error.message);
      }
    } catch (e) {
      console.warn("[AppShell] addHistoryEntry error:", e);
    }
  }, []);

  // Load introduction from API
  const loadIntroduction = useCallback(async () => {
    if (introLoading || introduction) return;
    setIntroError(null);
    setIntroLoading(true);
    try {
      const res = await fetch("/api/introduction", { method: "GET" });
      const data = (await res.json()) as unknown;
      if (!res.ok) {
        const message =
          typeof data === "object" && data && "error" in data
            ? String((data as { error: unknown }).error)
            : `Request failed (${res.status})`;
        throw new Error(message);
      }
      if (
        data &&
        typeof data === "object" &&
        "name" in data &&
        "zikosyoukai" in data &&
        "image" in data
      ) {
        setIntroduction(
          data as { name: string; zikosyoukai: string; image: { url: string } }
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "不明なエラー";
      setIntroError(message);
    } finally {
      setIntroLoading(false);
    }
  }, [introLoading, introduction]);

  // Context value
  const contextValue = useMemo<AppShellContextValue>(
    () => ({
      openHistory: () => {
        setHistoryOpen(true);
        void loadHistory();
      },
      openCreator: () => {
        setCreatorOpen(true);
        void loadIntroduction();
      },
      addHistoryEntry,
      selectedHistoryEntry,
      clearSelectedHistoryEntry: () => setSelectedHistoryEntry(null),
      incrementApiUsage: () => void apiUsage.incrementCount(),
      apiUsage: {
        count: apiUsage.count,
        limit: apiUsage.limit,
        hydrated: apiUsage.hydrated,
      },
    }),
    [
      selectedHistoryEntry,
      loadIntroduction,
      loadHistory,
      addHistoryEntry,
      apiUsage.incrementCount,
      apiUsage.count,
      apiUsage.limit,
      apiUsage.hydrated,
    ]
  );

  return (
    <AppShellContext.Provider value={contextValue}>
      <div className="min-h-dvh bg-[#F2F2F7]">
        <Navbar
          onHistoryClick={() => {
            setHistoryOpen(true);
            void loadHistory();
          }}
          onCreatorClick={() => {
            setCreatorOpen(true);
            void loadIntroduction();
          }}
        />

        {children}

        <HistoryModal
          isOpen={historyOpen}
          onClose={() => setHistoryOpen(false)}
          history={history}
          isLoading={historyLoading}
          onSelect={(entry) => setSelectedHistoryEntry(entry)}
        />

        <ProfileModal
          isOpen={creatorOpen}
          onClose={() => setCreatorOpen(false)}
          introduction={introduction}
          isLoading={introLoading}
          error={introError}
          onRetry={() => void loadIntroduction()}
        />
      </div>
    </AppShellContext.Provider>
  );
}
