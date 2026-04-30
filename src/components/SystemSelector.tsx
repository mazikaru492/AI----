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
          {/* PC: 大きなタイトル / スマホ: コンパクト */}
          <h1 className="text-2xl md:text-4xl lg:text-5xl font-bold tracking-tight text-white drop-shadow-sm">
            AI問題変換
          </h1>
          <p className="mt-1.5 md:mt-3 text-xs md:text-base lg:text-lg text-white/75">
            使いたいシステムを選択してください
          </p>
        </header>

        {/* PC: 2カラム+大きなギャップ / スマホ: 1カラム */}
        <section className="grid gap-3 md:gap-6 lg:gap-8 md:grid-cols-2">
          {systems.map((system) => {
            const Icon = ICON_MAP[system.icon] ?? Sparkles;
            return (
              <button
                key={system.id}
                type="button"
                disabled={!system.enabled}
                onClick={() => onSelect(system.id)}
                className="liquid-panel group flex h-full flex-col rounded-[24px] md:rounded-[28px] p-5 md:p-7 text-left transition-all hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
              >
                {/* アイコン: PC→大きめ、スマホ→コンパクト */}
                <div className="mb-3 md:mb-4 inline-flex h-10 w-10 md:h-14 md:w-14 items-center justify-center rounded-xl md:rounded-2xl bg-white/25 text-white backdrop-blur-sm">
                  <Icon className="h-5 w-5 md:h-7 md:w-7 drop-shadow-sm" />
                </div>
                <h2 className="text-lg md:text-xl font-semibold text-white drop-shadow-sm">
                  {system.title}
                </h2>
                <p className="mt-0.5 md:mt-1 text-xs md:text-sm font-medium text-white/90">
                  {system.subtitle}
                </p>
                <p className="mt-2 md:mt-3 text-xs md:text-sm leading-relaxed text-white/70">
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
