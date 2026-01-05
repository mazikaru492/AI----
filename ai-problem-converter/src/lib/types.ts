export type GenerateResult = {
  new_problem: { problem_text: string };
  solution: { steps: string[]; final_answer: string };
};
