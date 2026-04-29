"use client";

import type { ComponentType } from "react";
import { Languages, Sparkles, Sigma } from "lucide-react";
import type { LearningSystemDefinition, SystemIcon } from "@/types";

interface SystemSelectorProps {
  systems: LearningSystemDefinition[];
  onSelect: (systemId: string) => void;
}

const ICON_MAP: Record<SystemIcon, ComponentType<{ className?: string }>> = {
  math: Sigma,
  english: Languages,
  generic: Sparkles,
};

export function SystemSelector({ systems, onSelect }: SystemSelectorProps) {
  return (
    <>
      <div className="liquid-page-bg" />

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8">
        <header className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-sm">
            AI問題変換
          </h1>
          <p className="mt-2 text-sm text-white/75">
            使いたいシステムを選択してください
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          {systems.map((system) => {
            const Icon = ICON_MAP[system.icon] ?? Sparkles;
            return (
              <button
                key={system.id}
                type="button"
                disabled={!system.enabled}
                onClick={() => onSelect(system.id)}
                className="liquid-panel group rounded-[28px] p-6 text-left transition-all hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {/* アイコン: ガラスの中のブルーアイコン */}
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/25 text-white backdrop-blur-sm">
                  <Icon className="h-6 w-6 drop-shadow-sm" />
                </div>
                <h2 className="text-xl font-semibold text-white drop-shadow-sm">
                  {system.title}
                </h2>
                <p className="mt-1 text-sm font-medium text-white/90">
                  {system.subtitle}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-white/70">
                  {system.description}
                </p>
              </button>
            );
          })}
        </section>
      </main>
    </>
  );
}
