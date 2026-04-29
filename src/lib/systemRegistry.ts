import type { ComponentType } from "react";
import type { LearningSystemDefinition } from "@/types";
import { EnglishWordTestSystem } from "@/components/systems/EnglishWordTestSystem";
import { MathProblemSystem } from "@/components/systems/MathProblemSystem";

export interface LearningSystemRegistryItem extends LearningSystemDefinition {
  component: ComponentType<{ onBack: () => void }>;
}

/**
 * 新しいシステム追加時は、この配列に1つ要素を追加するだけで
 * 選択画面と表示先の両方へ反映される。
 */
export const SYSTEM_REGISTRY: LearningSystemRegistryItem[] = [
  {
    id: "math-problem-transform",
    title: "数学 類題変換",
    subtitle: "画像から数値だけを変換",
    description:
      "問題用紙の画像を読み取り、式の数字のみを変えた類題画像を作成します。",
    icon: "math",
    enabled: true,
    component: MathProblemSystem,
  },
  {
    id: "english-word-test",
    title: "英語 単語穴埋めテスト",
    subtitle: "Excel範囲をランダム出題",
    description:
      "範囲指定した単語をランダム抽出し、選択肢と例文付きのテストをExcelで出力します。",
    icon: "english",
    enabled: true,
    component: EnglishWordTestSystem,
  },
];
