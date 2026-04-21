"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { GlobalUsageRow } from "@/lib/supabase";

const DAILY_LIMIT = 1500;
const WARNING_THRESHOLD = 0.8;

function getTodayString(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

export function useApiUsage() {
  const [count, setCount] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  // --- 初回マウント: Supabase から今日のカウントを取得 ---
  useEffect(() => {
    async function fetchCount() {
      try {
        const { data, error } = await supabase
          .from("global_usage")
          .select("count, date")
          .eq("id", 1)
          .single<Pick<GlobalUsageRow, "count" | "date">>();

        if (error) {
          console.warn("[useApiUsage] Supabase fetch failed:", error.message);
          return;
        }

        const today = getTodayString();
        // 日付が変わっていたらカウントは 0 として表示（DBはインクリメント時にリセット）
        setCount(data.date === today ? data.count : 0);
      } catch (e) {
        console.warn("[useApiUsage] unexpected error:", e);
      } finally {
        setHydrated(true);
      }
    }
    void fetchCount();
  }, []);

  // --- カウントをインクリメント（Supabase を更新） ---
  const incrementCount = useCallback(async () => {
    // 楽観的 UI: 先にローカル状態を +1
    setCount((prev) => prev + 1);

    try {
      const today = getTodayString();

      // 現在の行を取得
      const { data, error: fetchErr } = await supabase
        .from("global_usage")
        .select("count, date")
        .eq("id", 1)
        .single<Pick<GlobalUsageRow, "count" | "date">>();

      if (fetchErr) {
        console.warn("[useApiUsage] fetch before increment failed:", fetchErr.message);
        return;
      }

      const isNewDay = data.date !== today;
      const newCount = isNewDay ? 1 : data.count + 1;

      const { error: updateErr } = await supabase
        .from("global_usage")
        .update({
          count: newCount,
          date: today,
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);

      if (updateErr) {
        console.warn("[useApiUsage] update failed:", updateErr.message);
        return;
      }

      // サーバー側の確定値で同期
      setCount(newCount);
    } catch (e) {
      console.warn("[useApiUsage] incrementCount error:", e);
    }
  }, []);

  const remaining = Math.max(0, DAILY_LIMIT - count);
  const percentage = Math.min(100, (count / DAILY_LIMIT) * 100);
  const isWarning = count >= DAILY_LIMIT * WARNING_THRESHOLD;
  const isAtLimit = count >= DAILY_LIMIT;

  return {
    count,
    limit: DAILY_LIMIT,
    remaining,
    percentage,
    isWarning,
    isAtLimit,
    hydrated,
    incrementCount,
    // resetCount は Supabase 版では管理者操作扱いのため省略
    resetCount: () => {},
  };
}
