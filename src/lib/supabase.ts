import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // ビルド時にエラーを出さないよう警告のみ
  if (typeof window !== "undefined") {
    console.warn(
      "[Supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定です。",
    );
  }
}

// シングルトンとしてエクスポート
// 未設定の場合はダミー値を渡してクライアント自体は作れるようにする
// (実際のリクエスト時に 401 になるだけで起動はできる)
export const supabase = createClient(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseAnonKey ?? "placeholder",
);

// =====================================
// Supabase テーブル型
// =====================================

/** global_usage テーブル（1行のみ、全ユーザー共有カウンター） */
export interface GlobalUsageRow {
  id: number;
  count: number;
  date: string;
  updated_at: string;
}

/** conversion_history テーブル（変換履歴） */
export interface ConversionHistoryRow {
  id: string;
  created_at: string;
  summary: string;
  numbers_detected: number;
}
