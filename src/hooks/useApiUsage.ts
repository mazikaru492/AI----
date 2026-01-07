"use client";

import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "ai-problem-converter:api-usage";
const DAILY_LIMIT = 1500;
const WARNING_THRESHOLD = 0.8; // 80%

interface UsageData {
  date: string;
  count: number;
}

function getTodayString(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function parseUsageData(raw: string | null): UsageData {
  const today = getTodayString();
  if (!raw) return { date: today, count: 0 };

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "date" in parsed &&
      "count" in parsed
    ) {
      const data = parsed as UsageData;
      // 日付が違う場合はリセット
      if (data.date !== today) {
        return { date: today, count: 0 };
      }
      return data;
    }
  } catch {
    // パースエラーの場合は初期化
  }

  return { date: today, count: 0 };
}

export function useApiUsage() {
  const [count, setCount] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  // 初回マウント時にlocalStorageから読み込み
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const data = parseUsageData(raw);
      setCount(data.count);
    } catch (e) {
      console.warn("[useApiUsage] localStorage read failed", e);
    } finally {
      setHydrated(true);
    }
  }, []);

  // カウントが変更されたらlocalStorageに保存
  useEffect(() => {
    if (!hydrated) return;
    try {
      const data: UsageData = {
        date: getTodayString(),
        count,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("[useApiUsage] localStorage write failed", e);
    }
  }, [hydrated, count]);

  // カウントをインクリメント
  const incrementCount = useCallback(() => {
    setCount((prev) => prev + 1);
  }, []);

  // カウントをリセット
  const resetCount = useCallback(() => {
    setCount(0);
  }, []);

  // 表示用の情報
  const isWarning = count >= DAILY_LIMIT * WARNING_THRESHOLD;
  const isAtLimit = count >= DAILY_LIMIT;
  const remaining = Math.max(0, DAILY_LIMIT - count);
  const percentage = Math.min(100, (count / DAILY_LIMIT) * 100);

  return {
    count,
    limit: DAILY_LIMIT,
    remaining,
    percentage,
    isWarning,
    isAtLimit,
    hydrated,
    incrementCount,
    resetCount,
  };
}
