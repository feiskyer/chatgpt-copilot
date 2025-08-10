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

import { ModelMessage, stepCountIs, streamText } from "ai";
import * as vscode from "vscode";
import ChatGptViewProvider from "./chatgpt-view-provider";
import { logger } from "./logger";
import { getHeaders } from "./model-config";
import { getToolsWithWebSearch } from "./tool-utils";
import {
  executePromptToolCall,
  generateToolDescriptions,
} from "./prompt-based-tools";
import { recordParsingAttempt } from "./prompt-tools-monitor";
import { ToolCallParser } from "./tool-call-parser";
import { isOpenAIOModel, PromptBasedToolConfig } from "./types";

/**
 * Get prompt-based tool configuration from VSCode settings
 */
function getPromptBasedToolConfig(): PromptBasedToolConfig {
  const configuration = vscode.workspace.getConfiguration("chatgpt");

  return {
    enabled: configuration.get("promptBasedTools.enabled") || false,
    toolCallPattern: "<tool_call>",
    maxToolCalls: configuration.get("gpt3.maxSteps") || 15,
  };
}

/**
 * Enhanced chatGpt function with prompt-based tool call support
 * Implements the complete tool call loop like AI SDK does automatically
 */
export async function chatGptWithPromptTools(
  provider: ChatGptViewProvider,
  question: string,
  images: Record<string, string>,
  startResponse: () => void,
  updateResponse: (message: string) => void,
  updateReasoning: (message: string, roundNumber?: number) => void,
) {
  if (!provider.apiChat) {
    throw new Error("apiChat is undefined");
  }

  try {
    logger.appendLine(
      `INFO: chatgpt.model: ${provider.model} chatgpt.question: ${question.trim()}`,
    );

    const promptToolConfig = getPromptBasedToolConfig();
    const modelName = provider.model ? provider.model : "gpt-4o";
    logger.appendLine(
      `INFO: Using prompt-based tools: ${promptToolConfig.enabled}, model: ${modelName}`,
    );

    var chatMessage: ModelMessage = {
      role: "user",
      content: [
        {
          type: "text",
          text: question,
        },
      ],
    };
    Object.entries(images).forEach(([_, content]) => {
      (chatMessage.content as any[]).push({
        type: "image",
        image: content,
      });
    });

    /* placeholder for response */
    startResponse();

    const chunks: string[] = [];
    const reasonChunks: string[] = [];
    let toolCallCounter = 0;
    provider.chatHistory.push(chatMessage);

    // Prepare system prompt with tool descriptions if using prompt-based tools
    let systemPrompt = provider.modelConfig.systemPrompt;
    if (promptToolConfig.enabled && provider.toolSet) {
      const toolDescriptions = generateToolDescriptions(provider.toolSet);
      if (toolDescriptions) {
        systemPrompt = systemPrompt
          ? `${systemPrompt}\n\n${toolDescriptions}`
          : toolDescriptions;
        logger.appendLine(`INFO: Added tool descriptions to system prompt`);
      }
    }

    // Implement tool call loop for prompt-based tools (like AI SDK does automatically)
    if (promptToolConfig.enabled && provider.toolSet) {
      toolCallCounter = await executePromptBasedToolLoop(
        provider,
        systemPrompt,
        modelName,
        chunks,
        reasonChunks,
        toolCallCounter,
        updateResponse,
        updateReasoning,
      );
    } else {
      // Use standard AI SDK with native tools
      toolCallCounter = await executeStandardChat(
        provider,
        systemPrompt,
        modelName,
        chunks,
        reasonChunks,
        toolCallCounter,
        updateResponse,
        updateReasoning,
      );
    }

    provider.response = chunks.join("");
    if (reasonChunks.join("") !== "") {
      provider.reasoning = reasonChunks.join("");
    }

    logger.appendLine(
      `INFO: chatgpt.model: ${provider.model}, chatgpt.question: ${question.trim()}, final response: ${provider.response}`,
    );
  } catch (error) {
    logger.appendLine(
      `ERROR: chatgpt.model: ${provider.model} error: ${error}, backtrace: ${new Error().stack}`,
    );
    provider.sendMessage({
      type: "addError",
      value: `Error: ${error}`,
      autoScroll: provider.autoScroll,
    });
  }
}

/**
 * Execute prompt-based tool loop (mimics AI SDK's automatic tool calling)
 */
async function executePromptBasedToolLoop(
  provider: ChatGptViewProvider,
  systemPrompt: string,
  modelName: string,
  chunks: string[],
  reasonChunks: string[],
  toolCallCounter: number,
  updateResponse: (message: string) => void,
  updateReasoning: (message: string, roundNumber?: number) => void,
): Promise<number> {
  const maxSteps = provider.maxSteps || 15;
  let currentStep = 0;
  let conversationHistory = [...provider.chatHistory];

  while (currentStep < maxSteps) {
    currentStep++;
    logger.appendLine(
      `INFO: Prompt-based tool loop step ${currentStep}/${maxSteps}`,
    );

    // Make API call
    const inputs: any = {
      system: systemPrompt,
      model: provider.apiChat,
      messages: conversationHistory,
      abortSignal: provider.abortController?.signal,
      stopWhen: stepCountIs(provider.maxSteps),
      headers: getHeaders(),
      ...(isOpenAIOModel(modelName) && {
        providerOptions: {
          openai: {
            reasoningSummary: "auto",
            reasoningEffort: provider.reasoningEffort,
            ...(provider.modelConfig.maxTokens > 0 && {
              maxCompletionTokens: provider.modelConfig.maxTokens,
            }),
          },
        },
      }),
      ...(!isOpenAIOModel(modelName) && {
        maxOutputTokens:
          provider.modelConfig.maxTokens > 0
            ? provider.modelConfig.maxTokens
            : undefined,
        temperature: provider.modelConfig.temperature,
      }),
      ...(provider.provider === "Google" &&
        provider.reasoningEffort &&
        provider.reasoningEffort !== "" && {
          providerOptions: {
            google: {
              thinkingConfig: {
                thinkingBudget:
                  provider.reasoningEffort === "low"
                    ? 1500
                    : provider.reasoningEffort === "medium"
                      ? 8000
                      : 20000,
                includeThoughts: true,
              },
            },
          },
        }),
    };

    const result = streamText(inputs);
    let accumulatedText = "";
    let stepChunks: string[] = [];

    // Process streaming response
    for await (const part of result.fullStream) {
      switch (part.type) {
        case "text-delta": {
          accumulatedText += part.text;
          updateResponse(part.text);
          chunks.push(part.text);
          stepChunks.push(part.text);
          break;
        }
        case "reasoning-delta": {
          updateReasoning(part.text, currentStep);
          reasonChunks.push(part.text);
          break;
        }
        case "error": {
          throw new Error(`${part.error}`);
        }
        default: {
          logger.appendLine(
            `INFO: prompt-based-tools step ${currentStep}: ${JSON.stringify(part)}`,
          );
          break;
        }
      }
    }

    // Check for tool calls in the accumulated text
    const parseStartTime = Date.now();
    const parseResult = ToolCallParser.parseToolCalls(
      accumulatedText,
      15,
      false,
    );
    const parseTime = Date.now() - parseStartTime;
    const toolCalls = parseResult.toolCalls;

    // Record parsing attempt in monitoring system
    recordParsingAttempt(
      parseResult.errors.length === 0 && toolCalls.length > 0,
      parseTime,
      toolCalls.length,
      parseResult.errors,
    );

    if (toolCalls.length === 0) {
      // No tool calls found, conversation is complete
      logger.appendLine(
        `INFO: No tool calls found in step ${currentStep}, ending loop`,
      );
      break;
    }

    // Execute tool calls and add results to conversation
    const toolResults: any[] = [];
    for (const toolCall of toolCalls) {
      toolCallCounter++; // Increment counter for each tool call

      // Create tool call UI (exactly like native tool calls)
      const toolCallHtml = createPromptToolCallHtml(toolCall, toolCallCounter);
      updateResponse(toolCallHtml);
      chunks.push(toolCallHtml);

      // Execute tool
      const result = await executePromptToolCall(toolCall, provider.toolSet!);
      toolResults.push(result);

      // Create tool result UI (exactly like native tool calls)
      const toolResultHtml = createPromptToolResultHtml(
        result,
        toolCallCounter,
      );
      updateResponse(toolResultHtml);
      chunks.push(toolResultHtml);

      logger.appendLine(
        `INFO: Tool ${toolCall.toolName} executed with result: ${JSON.stringify(result.result)}`,
      );
    }

    // Add structured conversation history with enhanced context
    const assistantResponse = stepChunks.join("");
    const toolCallsInResponse = toolCalls.length;

    // Create structured assistant message with metadata
    const assistantMessage: ModelMessage = {
      role: "assistant",
      content: assistantResponse,
    };

    // Add metadata as a separate context message for better tracking
    if (toolCallsInResponse > 0) {
      const contextMessage: ModelMessage = {
        role: "system",
        content: `[Assistant made ${toolCallsInResponse} tool calls in step ${currentStep}]`,
      };
      conversationHistory.push(assistantMessage, contextMessage);
    } else {
      conversationHistory.push(assistantMessage);
    }

    // Add structured tool results with enhanced context
    if (toolResults.length > 0) {
      const toolResultSummary = createToolResultSummary(toolResults);
      const toolResultMessage: ModelMessage = {
        role: "user",
        content: toolResultSummary,
      };
      conversationHistory.push(toolResultMessage);
    }

    // Continue the loop for the next step
  }

  // Clean up and optimize conversation history before final update
  const optimizedHistory = optimizeConversationHistory(
    conversationHistory,
    provider.maxSteps,
  );
  provider.chatHistory = optimizedHistory;

  // Log conversation statistics
  logConversationStats(conversationHistory, toolCallCounter, currentStep);

  return toolCallCounter;
}

/**
 * Execute standard chat with native AI SDK tools
 */
async function executeStandardChat(
  provider: ChatGptViewProvider,
  systemPrompt: string,
  modelName: string,
  chunks: string[],
  reasonChunks: string[],
  toolCallCounter: number,
  updateResponse: (message: string) => void,
  updateReasoning: (message: string, roundNumber?: number) => void,
): Promise<number> {
  const inputs: any = {
    system: systemPrompt,
    model: provider.apiChat,
    messages: provider.chatHistory,
    abortSignal: provider.abortController?.signal,
    tools: getToolsWithWebSearch(provider) || undefined,
    maxSteps: provider.maxSteps,
    headers: getHeaders(),
    ...(isOpenAIOModel(modelName) && {
      providerOptions: {
        openai: {
          reasoningSummary: "auto",
          reasoningEffort: provider.reasoningEffort,
          ...(provider.modelConfig.maxTokens > 0 && {
            maxCompletionTokens: provider.modelConfig.maxTokens,
          }),
        },
      },
    }),
    ...(!isOpenAIOModel(modelName) && {
      maxOutputTokens:
        provider.modelConfig.maxTokens > 0
          ? provider.modelConfig.maxTokens
          : undefined,
      temperature: provider.modelConfig.temperature,
    }),
    ...(provider.provider === "Google" &&
      provider.reasoningEffort &&
      provider.reasoningEffort !== "" && {
        providerOptions: {
          google: {
            thinkingConfig: {
              thinkingBudget:
                provider.reasoningEffort === "low"
                  ? 1500
                  : provider.reasoningEffort === "medium"
                    ? 8000
                    : 20000,
              includeThoughts: true,
            },
          },
        },
      }),
  };

  const result = streamText(inputs);
  for await (const part of result.fullStream) {
    switch (part.type) {
      case "text-delta": {
        updateResponse(part.text);
        chunks.push(part.text);
        break;
      }
      case "reasoning-delta": {
        updateReasoning(part.text, 1); // Standard chat only has one reasoning round
        reasonChunks.push(part.text);
        break;
      }
      case "tool-call": {
        toolCallCounter++;
        const toolCallHtml = createToolCallHtml(part, toolCallCounter);
        updateResponse(toolCallHtml);
        chunks.push(toolCallHtml);
        break;
      }
      case "error": {
        throw new Error(`${part.error}`);
      }
      default: {
        logger.appendLine(`INFO: standard chat: ${JSON.stringify(part)}`);
        break;
      }
    }
  }

  // Add final assistant response to chat history
  const assistantResponse: ModelMessage = {
    role: "assistant",
    content: chunks.join(""),
  };
  provider.chatHistory.push(assistantResponse);

  return toolCallCounter;
}

/**
 * Create HTML for native tool calls
 */
function createToolCallHtml(part: any, toolCallCounter: number): string {
  let formattedArgs = part.args;
  if (typeof formattedArgs === "string") {
    try {
      formattedArgs = JSON.parse(formattedArgs);
    } catch (e) {
      formattedArgs = part.args;
    }
  }

  const toolCallId = `tool-call-${Date.now()}-${toolCallCounter}`;
  const toolIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="tool-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>`;

  return `
<div class="tool-call-block" id="${toolCallId}" data-tool-name="${part.toolName}" data-tool-counter="${toolCallCounter}">
  <div class="tool-call-header" onclick="toggleToolCall('${toolCallId}')">
    <svg class="tool-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M9 18l6-6-6-6"/>
    </svg>
    <div class="tool-info">
      ${toolIcon}
      <span class="tool-name">${part.toolName}</span>
    </div>
    <span class="tool-status status-running">Running</span>
  </div>
  <div class="tool-call-content collapsed">
    <div class="tool-call-args">
      <div class="args-header">
        <span class="section-label">Arguments</span>
        <button class="copy-button" onclick="copyToolArgs(this, '${toolCallId}')">Copy</button>
      </div>
      <pre><code class="language-json">${JSON.stringify(formattedArgs, null, 2)}</code></pre>
    </div>
    <div class="tool-call-result">
      <div class="tool-loading">
        <div class="tool-loading-spinner"></div>
        <span>Waiting for result...</span>
      </div>
    </div>
  </div>
</div>`;
}

/**
 * Create HTML for prompt-based tool calls
 */
function createPromptToolCallHtml(
  toolCall: any,
  toolCallCounter: number,
): string {
  const toolCallId = `prompt-tool-call-${Date.now()}-${toolCallCounter}`;
  const toolIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="tool-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>`;

  return `
<div class="tool-call-block" id="${toolCallId}" data-tool-name="${toolCall.toolName}" data-tool-counter="${toolCallCounter}">
  <div class="tool-call-header" onclick="toggleToolCall('${toolCallId}')">
    <svg class="tool-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M9 18l6-6-6-6"/>
    </svg>
    <div class="tool-info">
      ${toolIcon}
      <span class="tool-name">${toolCall.toolName}</span>
    </div>
    <span class="tool-status status-running">Running</span>
  </div>
  <div class="tool-call-content collapsed">
    <div class="tool-call-args">
      <div class="args-header">
        <span class="section-label">Arguments</span>
        <button class="copy-button" onclick="copyToolArgs(this, '${toolCallId}')">Copy</button>
      </div>
      <pre><code class="language-json">${JSON.stringify(toolCall.arguments, null, 2)}</code></pre>
    </div>
    <div class="tool-call-result">
      <div class="tool-loading">
        <div class="tool-loading-spinner"></div>
        <span>Waiting for result...</span>
      </div>
    </div>
  </div>
</div>`;
}

/**
 * Create HTML for prompt-based tool results
 */
function createPromptToolResultHtml(
  result: any,
  toolCallCounter: number,
): string {
  return `<tool-result data-tool-name="${result.toolName}" data-counter="${toolCallCounter}">
${JSON.stringify(result.result)}
</tool-result>`;
}

/**
 * Create a structured summary of tool results for conversation history
 */
function createToolResultSummary(toolResults: any[]): string {
  if (toolResults.length === 0) {
    return "[No tool results]";
  }

  if (toolResults.length === 1) {
    const result = toolResults[0];
    if (result.error) {
      return `Tool ${result.toolName} failed: ${result.error}`;
    }

    const resultStr = JSON.stringify(result.result);
    const truncated =
      resultStr.length > 1000
        ? resultStr.substring(0, 1000) + "..."
        : resultStr;
    return `Tool ${result.toolName} result: ${truncated}`;
  }

  const successful = toolResults.filter((r) => !r.error);
  const failed = toolResults.filter((r) => r.error);

  let summary = `Tool execution summary (${toolResults.length} tools): `;
  if (successful.length > 0) {
    summary += `${successful.length} successful`;
  }
  if (failed.length > 0) {
    summary += `${successful.length > 0 ? ", " : ""}${failed.length} failed`;
  }

  summary += "\n\n";
  for (const result of toolResults) {
    if (result.error) {
      summary += `❌ ${result.toolName}: ${result.error}\n`;
    } else {
      const resultStr = JSON.stringify(result.result);
      const truncated =
        resultStr.length > 200
          ? resultStr.substring(0, 200) + "..."
          : resultStr;
      summary += `✅ ${result.toolName}: ${truncated}\n`;
    }
  }

  return summary.trim();
}

function optimizeConversationHistory(
  conversationHistory: ModelMessage[],
  maxSteps: number,
): ModelMessage[] {
  if (conversationHistory.length <= maxSteps * 3) {
    return conversationHistory;
  }

  const optimized: ModelMessage[] = [];
  let systemMessageCount = 0;
  let toolResultCount = 0;

  if (
    conversationHistory.length > 0 &&
    conversationHistory[0].role === "user"
  ) {
    optimized.push(conversationHistory[0]);
  }

  for (let i = 1; i < conversationHistory.length; i++) {
    const message = conversationHistory[i];

    if (message.role === "assistant") {
      optimized.push(message);
      continue;
    }

    if (message.role === "system") {
      systemMessageCount++;
      if (systemMessageCount <= 5) {
        optimized.push(message);
      }
      continue;
    }

    if (
      message.role === "user" &&
      typeof message.content === "string" &&
      message.content.includes("Tool ")
    ) {
      toolResultCount++;
      if (toolResultCount <= 3) {
        optimized.push(message);
      } else if (toolResultCount === 4) {
        optimized.push({
          role: "system",
          content: "[Previous tool results summarized]",
        });
      }
      continue;
    }

    optimized.push(message);
  }

  logger.appendLine(
    `INFO: Optimized conversation history from ${conversationHistory.length} to ${optimized.length} messages`,
  );
  return optimized;
}

function logConversationStats(
  conversationHistory: ModelMessage[],
  toolCallCount: number,
  stepCount: number,
): void {
  const stats = {
    totalMessages: conversationHistory.length,
    toolCallCount,
    stepCount,
    totalTokensEstimate: conversationHistory
      .reduce(
        (sum, msg) =>
          sum + (typeof msg.content === "string" ? msg.content.length / 4 : 0),
        0,
      )
      .toFixed(0),
  };

  logger.appendLine(
    `INFO: Conversation stats - Messages: ${stats.totalMessages}, Tools: ${stats.toolCallCount}, Steps: ${stats.stepCount}, Tokens: ~${stats.totalTokensEstimate}`,
  );
}
