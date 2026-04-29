/**
 * 学習システム選択画面で使う型
 */
export type SystemIcon = "math" | "english" | "generic";

export interface LearningSystemDefinition {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: SystemIcon;
  enabled: boolean;
}
