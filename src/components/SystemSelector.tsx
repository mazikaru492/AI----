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
      <div className="fixed inset-0 bg-[#F2F2F7] -z-10">
        <div
          className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-40"
          style={{
            background:
              "radial-gradient(circle, rgba(0,122,255,0.15) 0%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />
        <div
          className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full opacity-30"
          style={{
            background:
              "radial-gradient(circle, rgba(52,199,89,0.15) 0%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />
      </div>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8">
        <header className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            AI問題変換
          </h1>
          <p className="mt-2 text-sm text-slate-600">
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
                className="group rounded-[28px] border border-white/40 bg-white/75 p-6 text-left shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl transition-all hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#007AFF]/10 text-[#007AFF]">
                  <Icon className="h-6 w-6" />
                </div>
                <h2 className="text-xl font-semibold text-slate-900">
                  {system.title}
                </h2>
                <p className="mt-1 text-sm font-medium text-[#007AFF]">
                  {system.subtitle}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
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
