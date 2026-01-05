"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { GenerateResult } from "@/lib/types";
import { Clock, User, X } from "lucide-react";
import Image from "next/image";
import type { Introduction } from "@/types/introduction";

type HistoryEntry = {
  id: string;
  createdAt: string;
  result: GenerateResult;
};

type AppShellContextValue = {
  openHistory: () => void;
  openCreator: () => void;
  addHistoryEntry: (entry: HistoryEntry) => void;
  selectedHistoryEntry: HistoryEntry | null;
  clearSelectedHistoryEntry: () => void;
};

const AppShellContext = createContext<AppShellContextValue | null>(null);

const STORAGE_KEY = "ai-problem-converter:history";

function safeParseHistory(raw: string | null): HistoryEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is HistoryEntry => {
      if (!x || typeof x !== "object") return false;
      const o = x as Record<string, unknown>;
      return (
        typeof o.id === "string" &&
        typeof o.createdAt === "string" &&
        typeof o.result === "object" &&
        o.result !== null
      );
    });
  } catch {
    return [];
  }
}

export function useAppShell() {
  const value = useContext(AppShellContext);
  if (!value) {
    throw new Error("useAppShell must be used within <AppShell>");
  }
  return value;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedHistoryEntry, setSelectedHistoryEntry] =
    useState<HistoryEntry | null>(null);

  const [introduction, setIntroduction] = useState<Introduction | null>(null);
  const [introLoading, setIntroLoading] = useState(false);
  const [introError, setIntroError] = useState<string | null>(null);

  async function loadIntroduction() {
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
      setIntroduction(data as Introduction);
    } catch (e) {
      const message = e instanceof Error ? e.message : "不明なエラー";
      setIntroError(message);
    } finally {
      setIntroLoading(false);
    }
  }

  // 初回のみ localStorage から読み込み
  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    setHistory(safeParseHistory(raw));
  }, []);

  // history 更新時に localStorage に保存
  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }, [history]);

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
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedHistoryEntry, introLoading, introduction]
  );

  return (
    <AppShellContext.Provider value={contextValue}>
      <div className="min-h-dvh bg-zinc-50">
        <nav className="sticky top-0 z-40 w-full bg-white/80 backdrop-blur ring-1 ring-black/5">
          <div className="mx-auto flex h-14 w-full max-w-md items-center justify-between px-4">
            <div className="text-base font-semibold text-zinc-900">
              AI問題変換
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-3 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50"
              >
                <Clock className="h-4 w-4" aria-hidden="true" />
                履歴
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreatorOpen(true);
                  void loadIntroduction();
                }}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-3 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50"
              >
                <User className="h-4 w-4" aria-hidden="true" />
                制作者
              </button>
            </div>
          </div>
        </nav>

        {children}

        {historyOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-16"
            role="dialog"
            aria-modal="true"
            onClick={() => setHistoryOpen(false)}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-900">
                  出力履歴
                </h2>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl hover:bg-zinc-50"
                  onClick={() => setHistoryOpen(false)}
                  aria-label="close"
                >
                  <X className="h-5 w-5 text-zinc-700" />
                </button>
              </div>

              <div className="mt-3 max-h-[60dvh] overflow-auto">
                {history.length === 0 ? (
                  <p className="text-sm text-zinc-600">
                    まだ履歴がありません。
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {history.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className="w-full rounded-xl bg-zinc-50 p-3 text-left ring-1 ring-inset ring-black/5 hover:bg-zinc-100"
                          onClick={() => {
                            setSelectedHistoryEntry(item);
                            setHistoryOpen(false);
                          }}
                        >
                          <p className="text-xs font-semibold text-zinc-700">
                            {item.createdAt}
                          </p>
                          <p className="mt-1 line-clamp-2 text-sm text-zinc-900">
                            {item.result.new_problem.problem_text}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {creatorOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
            role="dialog"
            aria-modal="true"
            onClick={() => setCreatorOpen(false)}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-900">
                  制作者の紹介
                </h2>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl hover:bg-zinc-50"
                  onClick={() => setCreatorOpen(false)}
                  aria-label="close"
                >
                  <X className="h-5 w-5 text-zinc-700" />
                </button>
              </div>

              <div className="mt-4">
                {introLoading ? (
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
                ) : introError ? (
                  <div className="rounded-xl bg-zinc-50 p-3">
                    <p className="text-sm font-medium text-red-600">
                      {introError}
                    </p>
                    <button
                      type="button"
                      className="mt-3 h-11 w-full rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white"
                      onClick={() => void loadIntroduction()}
                    >
                      再読み込み
                    </button>
                  </div>
                ) : introduction ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="relative h-14 w-14 overflow-hidden rounded-full ring-1 ring-black/5">
                        <Image
                          src={introduction.image.url}
                          alt={introduction.name}
                          fill
                          className="object-cover"
                          sizes="56px"
                        />
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
                        {introduction.profile_text}
                      </p>
                    </div>

                    <button
                      type="button"
                      className="h-11 w-full rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white"
                      onClick={() => setCreatorOpen(false)}
                    >
                      閉じる
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl bg-zinc-50 p-3">
                    <p className="text-sm text-zinc-600">
                      読み込み準備中です。
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AppShellContext.Provider>
  );
}
