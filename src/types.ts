/**
 * @author Pengfei Ni
 *
 * @license
 * Copyright (c) 2024 - Present, Pengfei Ni
 *
 * All rights reserved. Code licensed under the ISC license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
export interface Prompt {
  id: string;
  name: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface PromptStore {
  prompts: Prompt[];
}

export function isReasoningModel(model: string) {
  const m = model.toLowerCase();
  return (
    m.includes("o1") ||
    m.includes("o3") ||
    m.includes("deepseek-r1") ||
    m.includes("reason")
  );
}
