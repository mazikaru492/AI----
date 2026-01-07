"use client";

import { useEffect, useRef, useState } from "react";

type Parser<T> = (raw: string | null) => T;
type Serializer<T> = (value: T) => string;

interface UseLocalStorageStateOptions<T> {
  defaultValue: T;
  parse?: Parser<T>;
  serialize?: Serializer<T>;
}

const defaultParse = <T>(raw: string | null, fallback: T): T => {
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const defaultSerialize = <T>(value: T): string => JSON.stringify(value);

/**
 * localStorage を SSR/ハイドレーションに安全な形で扱うためのフック。
 * - 初回マウントで localStorage から読み取り
 * - 読み取り完了前は書き込みを行わない（初期値で上書きする事故を防止）
 */
export function useLocalStorageState<T>(
  key: string,
  options: UseLocalStorageStateOptions<T>
) {
  const { defaultValue } = options;
  const parse: Parser<T> =
    options.parse ?? ((raw) => defaultParse<T>(raw, defaultValue));
  const serialize: Serializer<T> = options.serialize ?? defaultSerialize;

  const [value, setValue] = useState<T>(defaultValue);
  const [hydrated, setHydrated] = useState(false);

  const lastSerializedRef = useRef<string | null>(null);

  // Read on mount
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      const next = parse(raw);
      setValue(next);
    } catch (e) {
      console.warn("[useLocalStorageState] localStorage read failed", e);
      setValue(defaultValue);
    } finally {
      setHydrated(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Write after hydration only
  useEffect(() => {
    if (!hydrated) return;
    try {
      const serialized = serialize(value);
      if (serialized === lastSerializedRef.current) return;
      window.localStorage.setItem(key, serialized);
      lastSerializedRef.current = serialized;
    } catch (e) {
      console.warn("[useLocalStorageState] localStorage write failed", e);
    }
  }, [hydrated, key, value, serialize]);

  return [value, setValue, hydrated] as const;
}
