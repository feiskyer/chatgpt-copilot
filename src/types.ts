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

export function isOpenAIOModel(model: string) {
  const m = model.toLowerCase();
  return (
    m.includes("o1") ||
    m.includes("o3") ||
    m.includes("o4")
  );
}


export function isReasoningModel(model: string) {
  const m = model.toLowerCase();
  return (
    isOpenAIOModel(model) ||
    m.includes("deepseek-r1") ||
    m.includes("reason") ||
    m.includes("claude-3-7") ||
    m.includes("qwen3")
  );
}

// Prompt-based tool call types
export interface PromptBasedToolCall {
  id: string;
  toolName: string;
  arguments: Record<string, any>;
  rawText: string;
}

export interface PromptBasedToolResult {
  id: string;
  toolName: string;
  result: any;
  error?: string;
}

export interface PromptBasedToolConfig {
  enabled: boolean;
  toolCallPattern: string;
  maxToolCalls: number;
}
