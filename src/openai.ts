/* eslint-disable eqeqeq */

/**
 *
 * @license
 * Copyright (c) 2024 - Present, Pengfei Ni
 *
 * All rights reserved. Code licensed under the ISC license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import { createAzure } from "@ai-sdk/azure";
import { createOpenAI } from "@ai-sdk/openai";
import {
  extractReasoningMiddleware,
  ModelMessage,
  stepCountIs,
  streamText,
  wrapLanguageModel,
} from "ai";
import ChatGptViewProvider from "./chatgpt-view-provider";
import { logger } from "./logger";
import { getHeaders, ModelConfig } from "./model-config";
import { getToolsWithWebSearch } from "./tool-utils";
import { isOpenAIOModel, isReasoningModel } from "./types";

const azureAPIVersion = "2025-04-01-preview";

// initGptModel initializes the GPT model.
export async function initGptModel(
  viewProvider: ChatGptViewProvider,
  config: ModelConfig,
) {
  // AzureOpenAI
  if (config.apiBaseUrl?.includes("openai.azure.com")) {
    const instanceName = config.apiBaseUrl.split(".")[0].split("//")[1];
    const deployName =
      config.apiBaseUrl.split("/")[config.apiBaseUrl.split("/").length - 1];

    const azure = createAzure({
      resourceName: instanceName,
      apiKey: config.apiKey,
      // apiVersion: azureAPIVersion,
      // fetch: fetchOpenAI, // workaround for https://github.com/vercel/ai/issues/4662
    });
    let azureModel = azure.languageModel(deployName);
    if (config.enableResponsesAPI) {
      azureModel = azure.responses(deployName);
    }

    if (config.isReasoning) {
      viewProvider.apiReasoning = wrapLanguageModel({
        model: azureModel as any,
        middleware: extractReasoningMiddleware({ tagName: "think" }),
      });
    } else {
      if (isReasoningModel(deployName)) {
        viewProvider.apiChat = wrapLanguageModel({
          model: azureModel as any,
          middleware: extractReasoningMiddleware({ tagName: "think" }),
        });
      } else {
        viewProvider.apiChat = azureModel as any;
      }
    }
  } else {
    // OpenAI
    const openai = createOpenAI({
      baseURL: config.apiBaseUrl,
      apiKey: config.apiKey,
      organization: config.organization,
      // fetch: fetchOpenAI, // workaround for https://github.com/vercel/ai/issues/4662
    });

    if (config.isReasoning) {
      const model = viewProvider.reasoningModel
        ? viewProvider.reasoningModel
        : "o3-mini";
      viewProvider.apiReasoning = wrapLanguageModel({
        model: config.enableResponsesAPI
          ? (openai.responses(model) as any)
          : (openai.languageModel(model) as any),
        middleware: extractReasoningMiddleware({ tagName: "think" }),
      });
    } else {
      const model = viewProvider.model ? viewProvider.model : "gpt-4o";
      if (isReasoningModel(model)) {
        viewProvider.apiChat = wrapLanguageModel({
          model: config.enableResponsesAPI
            ? (openai.responses(model) as any)
            : (openai.languageModel(model) as any),
          middleware: extractReasoningMiddleware({ tagName: "think" }),
        });
      } else {
        viewProvider.apiChat = openai.languageModel(model) as any;
      }
    }
  }
}

// chatGpt is a function that completes the chat.
export async function chatGpt(
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

    const chunks = [];
    const reasonChunks = [];
    // Add a counter for tool calls to generate unique IDs
    let toolCallCounter = 0;
    provider.chatHistory.push(chatMessage);
    const modelName = provider.model ? provider.model : "gpt-4o";

    // Get tools including web search tools if applicable
    const tools = getToolsWithWebSearch(provider);

    if (tools && Object.keys(tools).length > 0) {
      logger.appendLine(
        `DEBUG: Tools available for model: ${Object.keys(tools).join(", ")}`,
      );
    }

    var inputs: any = {
      system: provider.modelConfig.systemPrompt,
      model: provider.apiChat,
      messages: provider.chatHistory,
      abortSignal: provider.abortController?.signal,
      tools: tools || undefined,
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
      ...((provider.provider === "Google" ||
        provider.provider === "GeminiCLI") &&
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
    // logger.appendLine(`INFO: chatgpt.model: ${provider.model} chatgpt.question: ${question.trim()} inputs: ${JSON.stringify(inputs, null, 2)}`);
    const result = streamText(inputs);
    
    // Track tool call and result state for debugging tool utilization issues
    // These help identify when models don't properly utilize tool results
    let hasToolCalls = false; // Tracks if any tool calls were made in this stream
    let hasToolResults = false; // Tracks if any tool results were received
    let textAfterToolResult = false; // Tracks if text was generated after receiving tool results
    let lastEventWasToolResult = false; // Helper to detect text immediately following a tool result
    
    for await (const part of result.fullStream) {
      // logger.appendLine(`INFO: chatgpt.model: ${provider.model} chatgpt.question: ${question.trim()} response: ${JSON.stringify(part, null, 2)}`);
      switch (part.type) {
        case "text-delta": {
          if (lastEventWasToolResult && !textAfterToolResult) {
            textAfterToolResult = true;
            logger.appendLine(
              `INFO: chatgpt.model: ${provider.model}, text received after tool result - model is utilizing tool output`,
            );
          }
          updateResponse(part.text);
          chunks.push(part.text);
          break;
        }
        case "reasoning-delta": {
          updateReasoning(part.text, 1); // Main chat only has one reasoning round
          reasonChunks.push(part.text);
          break;
        }
        case "tool-call": {
          hasToolCalls = true;
          lastEventWasToolResult = false;
          
          let formattedArgs = part.input;
          if (typeof formattedArgs === "string") {
            try {
              formattedArgs = JSON.parse(formattedArgs);
            } catch (e) {
              // If parsing fails, use the original string
              // @ts-ignore
              formattedArgs = part.args;
            }
          }

          // Generate a unique ID for this tool call
          toolCallCounter++;
          const toolCallId = `tool-call-${Date.now()}-${toolCallCounter}`;

          // Create tool icon based on the tool name
          const toolIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="tool-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
</svg>`;

          // Create an enhanced collapsible HTML structure for the tool call
          const toolCallHtml = `
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

          updateResponse(toolCallHtml);
          chunks.push(toolCallHtml);
          break;
        }

        // @ts-ignore;
        case "tool-result": {
          hasToolResults = true;
          lastEventWasToolResult = true;
          
          // @ts-ignore
          const toolName = part.toolName;
          // @ts-ignore - The correct property is 'output' according to AI SDK types
          const result = part.output;

          logger.appendLine(
            `INFO: Tool ${toolName} result received: ${JSON.stringify(result)}`,
          );

          let formattedResult = result;

          // First check if result is already an object with MCP format
          if (
            formattedResult &&
            typeof formattedResult === "object" &&
            "content" in formattedResult &&
            Array.isArray(formattedResult.content)
          ) {
            // Extract text from content array
            const textContent = formattedResult.content
              .filter((item: any) => item.type === "text")
              .map((item: any) => item.text)
              .join("\n");

            if (textContent) {
              // Try to parse the text content as JSON for better formatting
              try {
                const parsedContent = JSON.parse(textContent);
                formattedResult = parsedContent;
              } catch (e) {
                // If not JSON, keep as text (might be markdown or plain text)
                formattedResult = textContent;
              }
            }
          } else if (typeof formattedResult === "string") {
            // Try to parse if it's a string
            try {
              const parsed = JSON.parse(formattedResult);
              // Check if parsed result has MCP format
              if (
                parsed &&
                typeof parsed === "object" &&
                "content" in parsed &&
                Array.isArray(parsed.content)
              ) {
                // Extract text from content array
                const textContent = parsed.content
                  .filter((item: any) => item.type === "text")
                  .map((item: any) => item.text)
                  .join("\n");

                if (textContent) {
                  // Try to parse the text content as JSON for better formatting
                  try {
                    const parsedContent = JSON.parse(textContent);
                    formattedResult = parsedContent;
                  } catch (e) {
                    // If not JSON, keep as text (might be markdown or plain text)
                    formattedResult = textContent;
                  }
                }
              } else {
                formattedResult = parsed;
              }
            } catch (e) {
              // If parsing fails, use the original string
              formattedResult = result;
            }
          }

          // Create a special marker for tool results that will be processed by tool-call.js
          const toolResultText = `<tool-result data-tool-name="${toolName}" data-counter="${toolCallCounter}">
          ${JSON.stringify(formattedResult, null, 2)}
          </tool-result>`;

          updateResponse(toolResultText);
          chunks.push(toolResultText);
          break;
        }

        case "error": {
          if (provider.provider === "GeminiCLI") {
            logger.appendLine(
              `INFO: chatgpt.model: ${provider.model}, temp error: ${JSON.stringify(part)}`,
            );
            continue;
          }

          // raise the error to be caught by the catch block
          throw new Error(`${part.error}`);
        }

        case "start-step": {
          logger.appendLine(
            `INFO: chatgpt.model: ${provider.model}, step started`,
          );
          break;
        }

        case "finish-step": {
          // @ts-ignore - finishReason is available on finish-step parts
          const finishReason = part.finishReason;
          logger.appendLine(
            `INFO: chatgpt.model: ${provider.model}, step finished with reason: ${finishReason}`,
          );
          break;
        }

        default: {
          logger.appendLine(
            `INFO: chatgpt.model: ${provider.model}, chatgpt.question: ${question.trim()}, debug response: ${JSON.stringify(part)}`,
          );
          break;
        }
      }
    }

    // Log warning if tool results were received but no text-delta followed
    // This helps identify models that don't properly utilize tool results
    if (hasToolResults && !textAfterToolResult) {
      logger.appendLine(
        `WARN: chatgpt.model: ${provider.model}, tool results were received but no text was generated afterward. ` +
        `This may indicate the model doesn't properly utilize tool results. ` +
        `Consider enabling 'chatgpt.promptBasedTools.enabled' for better tool handling with this model.`,
      );
    }

    provider.response = chunks.join("");
    if (reasonChunks.join("") != "") {
      provider.reasoning = reasonChunks.join("");
    }
    const reasoning = await result.reasoningText;
    if (reasoning && reasoning != "") {
      provider.reasoning = reasoning;
      updateReasoning(reasoning, 1); // Main chat only has one reasoning round
    }

    // Save both the text response and tool calls in the chat history
    const assistantResponse: any = {
      role: "assistant",
      content: chunks.join(""),
    };
    provider.chatHistory.push(assistantResponse);

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
