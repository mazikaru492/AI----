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

/**
 * システム選択画面
 * PC: 2カラムグリッド、大きなカード、広い余白、中央配置
 * スマホ: 1カラム、コンパクトなカード、タッチフレンドリー
 */
export function SystemSelector({ systems, onSelect }: SystemSelectorProps) {
  return (
    <>
      <div className="liquid-page-bg" />

      {/* PC: max-w-4xl+大きい余白 / スマホ: max-w-lg+小さい余白 */}
      <main className="mx-auto flex w-full max-w-xl md:max-w-5xl lg:max-w-6xl flex-col gap-6 md:gap-10 px-4 md:px-10 py-6 md:py-14">
        <header className="text-center md:text-left">
          <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white drop-shadow-sm">
            AI問題変換
          </h1>
          <p className="mt-2 md:mt-3 text-base md:text-lg lg:text-xl text-white/80">
            使いたいシステムを選択してください
          </p>
        </header>

        {/* PC: 2カラム / スマホ: 1カラム */}
        <section className="grid gap-4 md:gap-6 lg:gap-8 md:grid-cols-2">
          {systems.map((system) => {
            const Icon = ICON_MAP[system.icon] ?? Sparkles;
            return (
              <button
                key={system.id}
                type="button"
                disabled={!system.enabled}
                onClick={() => onSelect(system.id)}
                className="liquid-panel group flex h-full flex-col rounded-[24px] md:rounded-[28px] p-6 md:p-8 text-left transition-all hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
              >
                {/* アイコン */}
                <div className="mb-4 md:mb-5 inline-flex h-13 w-13 md:h-16 md:w-16 items-center justify-center rounded-2xl bg-white/25 text-white backdrop-blur-sm">
                  <Icon className="h-6 w-6 md:h-8 md:w-8 drop-shadow-sm" />
                </div>
                <h2 className="text-xl md:text-2xl font-bold text-white drop-shadow-sm">
                  {system.title}
                </h2>
                <p className="mt-1 md:mt-1.5 text-sm md:text-base font-medium text-white/90">
                  {system.subtitle}
                </p>
                <p className="mt-2.5 md:mt-3 text-sm md:text-base leading-relaxed text-white/75">
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
