"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { HistoryEntry, Introduction } from "@/types";
import { useLocalStorageState } from "@/hooks/useLocalStorageState";
import { useApiUsage } from "@/hooks/useApiUsage";
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
// Storage
// =====================================

const STORAGE_KEY = "ai-problem-converter:history";

function safeParseHistory(raw: string | null): HistoryEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is HistoryEntry => {
      if (!x || typeof x !== "object") return false;
      const o = x as Record<string, unknown>;
      if (typeof o.id !== "string") return false;
      if (typeof o.createdAt !== "string") return false;
      if (!o.result) return false;
      return true;
    });
  } catch {
    return [];
  }
}

function isIntroduction(value: unknown): value is Introduction {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.name !== "string") return false;
  if (typeof v.zikosyoukai !== "string") return false;
  if (!v.image || typeof v.image !== "object") return false;
  const img = v.image as Record<string, unknown>;
  if (typeof img.url !== "string") return false;
  return true;
}

// =====================================
// Component
// =====================================

export function AppShell({ children }: { children: React.ReactNode }) {
  // Modal state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);

  // API usage tracking
  const apiUsage = useApiUsage();

  // History state
  const [history, setHistory] = useLocalStorageState<HistoryEntry[]>(
    STORAGE_KEY,
    {
      defaultValue: [],
      parse: safeParseHistory,
    }
  );
  const [selectedHistoryEntry, setSelectedHistoryEntry] =
    useState<HistoryEntry | null>(null);

  // Introduction state
  const [introduction, setIntroduction] = useState<Introduction | null>(null);
  const [introLoading, setIntroLoading] = useState(false);
  const [introError, setIntroError] = useState<string | null>(null);

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
      if (!isIntroduction(data)) {
        throw new Error(
          "microCMSの応答形式が想定と異なります。フィールドを確認してください。"
        );
      }
      setIntroduction(data);
    } catch (e) {
      const message = e instanceof Error ? e.message : "不明なエラー";
      setIntroError(message);
    } finally {
      setIntroLoading(false);
    }
  }, [introLoading, introduction]);

  // localStorage read/write is handled by useLocalStorageState

  // Context value
  const contextValue = useMemo<AppShellContextValue>(
    () => ({
      openHistory: () => setHistoryOpen(true),
      openCreator: () => {
        setCreatorOpen(true);
        void loadIntroduction();
      },
      addHistoryEntry: (entry) => {
        setHistory((prev) => [entry, ...prev]);
      },
      selectedHistoryEntry,
      clearSelectedHistoryEntry: () => setSelectedHistoryEntry(null),
      incrementApiUsage: apiUsage.incrementCount,
      apiUsage: {
        count: apiUsage.count,
        limit: apiUsage.limit,
        hydrated: apiUsage.hydrated,
      },
    }),
    [selectedHistoryEntry, loadIntroduction, setHistory, apiUsage.incrementCount, apiUsage.count, apiUsage.limit, apiUsage.hydrated]
  );

  return (
    <AppShellContext.Provider value={contextValue}>
      <div className="min-h-dvh bg-zinc-50">
        <Navbar
          onHistoryClick={() => setHistoryOpen(true)}
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
