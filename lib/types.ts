// API応答の型定義

export interface GeneratedProblem {
  originalProblem: string;
  newProblem: string;
  solution: string;
  steps: string[];
  answer: string;
}

export interface ApiResponse {
  success: boolean;
  data?: GeneratedProblem;
  error?: string;
}
