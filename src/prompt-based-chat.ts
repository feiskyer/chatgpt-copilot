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

import { CoreMessage, streamText } from "ai";
import * as vscode from "vscode";
import ChatGptViewProvider from "./chatgpt-view-provider";
import { logger } from "./logger";
import { getHeaders } from "./model-config";
import {
  executePromptToolCall,
  generateToolDescriptions
} from "./prompt-based-tools";
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
    maxToolCalls: configuration.get("gpt3.maxSteps") || 10,
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
  updateReasoning: (message: string) => void,
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
    logger.appendLine(`INFO: Using prompt-based tools: ${promptToolConfig.enabled}, model: ${modelName}`);

    var chatMessage: CoreMessage = {
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
        systemPrompt = systemPrompt ? `${systemPrompt}\n\n${toolDescriptions}` : toolDescriptions;
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
        updateReasoning
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
        updateReasoning
      );
    }

    provider.response = chunks.join("");
    if (reasonChunks.join("") != "") {
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
  updateReasoning: (message: string) => void
): Promise<number> {
  const maxSteps = provider.maxSteps || 5;
  let currentStep = 0;
  let conversationHistory = [...provider.chatHistory];

  while (currentStep < maxSteps) {
    currentStep++;
    logger.appendLine(`INFO: Prompt-based tool loop step ${currentStep}/${maxSteps}`);

    // Make API call
    const inputs: any = {
      system: systemPrompt,
      model: provider.apiChat,
      messages: conversationHistory,
      abortSignal: provider.abortController?.signal,
      maxSteps: 1, // Single step for manual control
      headers: getHeaders(),
      ...(isOpenAIOModel(modelName) && {
        providerOptions: {
          openai: {
            reasoningSummary: "auto",
            reasoningEffort: provider.reasoningEffort,
            maxCompletionTokens: provider.modelConfig.maxTokens,
          },
        },
      }),
      ...(!isOpenAIOModel(modelName) && {
        maxTokens: provider.modelConfig.maxTokens,
        temperature: provider.modelConfig.temperature,
      }),
    };

    const result = await streamText(inputs);
    let accumulatedText = "";
    let stepChunks: string[] = [];

    // Process streaming response
    for await (const part of result.fullStream) {
      switch (part.type) {
        case "text-delta": {
          accumulatedText += part.textDelta;
          updateResponse(part.textDelta);
          chunks.push(part.textDelta);
          stepChunks.push(part.textDelta);
          break;
        }
        case "reasoning": {
          updateReasoning(part.textDelta);
          reasonChunks.push(part.textDelta);
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
    const toolCalls = ToolCallParser.parseToolCalls(accumulatedText);

    if (toolCalls.length === 0) {
      // No tool calls found, conversation is complete
      logger.appendLine(`INFO: No tool calls found in step ${currentStep}, ending loop`);
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
      const toolResultHtml = createPromptToolResultHtml(result, toolCallCounter);
      updateResponse(toolResultHtml);
      chunks.push(toolResultHtml);

      logger.appendLine(`INFO: Tool ${toolCall.toolName} executed with result: ${JSON.stringify(result.result)}`);
    }

    // Add assistant response with tool calls to conversation history
    const assistantMessage: CoreMessage = {
      role: "assistant",
      content: stepChunks.join(""),
    };
    conversationHistory.push(assistantMessage);

    // Add tool results as user messages (this is how AI SDK does it)
    for (const result of toolResults) {
      const toolResultMessage: CoreMessage = {
        role: "user",
        content: `Tool ${result.toolName} result: ${JSON.stringify(result.result)}`
      };
      conversationHistory.push(toolResultMessage);
    }

    // Continue the loop for the next step
  }

  // Update provider's chat history with the final conversation
  provider.chatHistory = conversationHistory;
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
  updateReasoning: (message: string) => void
): Promise<number> {
  const inputs: any = {
    system: systemPrompt,
    model: provider.apiChat,
    messages: provider.chatHistory,
    abortSignal: provider.abortController?.signal,
    tools: provider.toolSet?.tools || undefined,
    maxSteps: provider.maxSteps,
    headers: getHeaders(),
    ...(isOpenAIOModel(modelName) && {
      providerOptions: {
        openai: {
          reasoningSummary: "auto",
          reasoningEffort: provider.reasoningEffort,
          maxCompletionTokens: provider.modelConfig.maxTokens,
        },
      },
    }),
    ...(!isOpenAIOModel(modelName) && {
      maxTokens: provider.modelConfig.maxTokens,
      temperature: provider.modelConfig.temperature,
    }),
  };

  const result = await streamText(inputs);
  for await (const part of result.fullStream) {
    switch (part.type) {
      case "text-delta": {
        updateResponse(part.textDelta);
        chunks.push(part.textDelta);
        break;
      }
      case "reasoning": {
        updateReasoning(part.textDelta);
        reasonChunks.push(part.textDelta);
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
        logger.appendLine(
          `INFO: standard chat: ${JSON.stringify(part)}`,
        );
        break;
      }
    }
  }

  // Add final assistant response to chat history
  const assistantResponse: CoreMessage = {
    role: "assistant",
    content: chunks.join("")
  };
  provider.chatHistory.push(assistantResponse);

  return toolCallCounter;
}

// /**
//  * Process prompt-based tool calls in streaming response
//  */
// async function processPromptBasedToolCallsInStream(
//   text: string,
//   provider: ChatGptViewProvider,
//   toolCallCounter: number,
//   updateResponse: (message: string) => void
// ) {
//   if (!provider.toolSet) return;

//   const { toolCalls, results } = await processPromptBasedToolCalls(
//     text,
//     provider.toolSet,
//     (toolCall) => {
//       // Create tool call UI when tool is detected
//       const toolCallHtml = createPromptToolCallHtml(toolCall, ++toolCallCounter);
//       updateResponse(toolCallHtml);
//     },
//     (result) => {
//       // Create tool result UI when result is available
//       const toolResultText = createPromptToolResultHtml(result, toolCallCounter);
//       updateResponse(toolResultText);
//     }
//   );

//   logger.appendLine(`INFO: Processed ${toolCalls.length} prompt-based tool calls`);
// }

/**
 * Create HTML for native tool calls
 */
function createToolCallHtml(part: any, toolCallCounter: number): string {
  let formattedArgs = part.args;
  if (typeof formattedArgs === 'string') {
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
function createPromptToolCallHtml(toolCall: any, toolCallCounter: number): string {
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
      <span class="tool-name">${toolCall.toolName} (prompt-based)</span>
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

// /**
//  * Create HTML for native tool results
//  */
// function createToolResultHtml(part: any, toolCallCounter: number): string {
//   let formattedResult = part.result;
//   if (typeof formattedResult === 'string') {
//     try {
//       formattedResult = JSON.parse(formattedResult);
//     } catch (e) {
//       formattedResult = part.result;
//     }
//   }

//   return `<tool-result data-tool-name="${part.toolName}" data-counter="${toolCallCounter}">
// ${JSON.stringify(formattedResult)}
// </tool-result>`;
// }

/**
 * Create HTML for prompt-based tool results
 */
function createPromptToolResultHtml(result: any, toolCallCounter: number): string {
  return `<tool-result data-tool-name="${result.toolName}" data-counter="${toolCallCounter}">
${JSON.stringify(result.result)}
</tool-result>`;
}
