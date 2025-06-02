/* eslint-disable eqeqeq */
/* eslint-disable @typescript-eslint/naming-convention */
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
import { createAzure } from "@ai-sdk/azure";
import { createOpenAI } from "@ai-sdk/openai";
import {
  CoreMessage,
  extractReasoningMiddleware,
  streamText,
  wrapLanguageModel
} from "ai";
import ChatGptViewProvider from "./chatgpt-view-provider";
import { logger } from "./logger";
import { getHeaders, ModelConfig } from "./model-config";
import { isOpenAIOModel, isReasoningModel } from "./types";
import { fetchOpenAI } from "./utils";

const azureAPIVersion = "2025-02-01-preview";

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
      apiVersion: azureAPIVersion,
      fetch: fetchOpenAI, // workaround for https://github.com/vercel/ai/issues/4662
    });

    if (config.isReasoning) {
      viewProvider.apiReasoning = wrapLanguageModel({
        model: azure.languageModel(deployName),
        middleware: extractReasoningMiddleware({ tagName: "think" }),
      });
    } else {
      if (isReasoningModel(deployName)) {
        viewProvider.apiChat = wrapLanguageModel({
          model: azure.languageModel(deployName),
          middleware: extractReasoningMiddleware({ tagName: "think" }),
        });
      } else {
        viewProvider.apiChat = azure.languageModel(deployName);
      }
    }
  } else {
    // OpenAI
    const openai = createOpenAI({
      baseURL: config.apiBaseUrl,
      apiKey: config.apiKey,
      organization: config.organization,
      fetch: fetchOpenAI, // workaround for https://github.com/vercel/ai/issues/4662
    });

    if (config.isReasoning) {
      const model = viewProvider.reasoningModel
        ? viewProvider.reasoningModel
        : "o3-mini";
      viewProvider.apiReasoning = wrapLanguageModel({
        model: openai.languageModel(model),
        middleware: extractReasoningMiddleware({ tagName: "think" }),
      });
    } else {
      const model = viewProvider.model ? viewProvider.model : "gpt-4o";
      if (isReasoningModel(model)) {
        viewProvider.apiChat = wrapLanguageModel({
          model: openai.languageModel(model),
          middleware: extractReasoningMiddleware({ tagName: "think" }),
        });
      } else {
        viewProvider.apiChat = openai.languageModel(model);
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
  updateReasoning: (message: string) => void,
) {
  if (!provider.apiChat) {
    throw new Error("apiChat is undefined");
  }

  try {
    logger.appendLine(
      `INFO: chatgpt.model: ${provider.model} chatgpt.question: ${question.trim()}`,
    );

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

    const chunks = [];
    const reasonChunks = [];
    // Add a counter for tool calls to generate unique IDs
    let toolCallCounter = 0;
    provider.chatHistory.push(chatMessage);
    const modelName = provider.model ? provider.model : "gpt-4o";
    var inputs: any = {
      system: provider.modelConfig.systemPrompt,
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
        // topP: provider.modelConfig.topP,
      }),
    };
    const result = await streamText(inputs);
    for await (const part of result.fullStream) {
      // logger.appendLine(`INFO: chatgpt.model: ${provider.model} chatgpt.question: ${question.trim()} response: ${JSON.stringify(part, null, 2)}`);
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
          let formattedArgs = part.args;
          if (typeof formattedArgs === 'string') {
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
          // @ts-ignore
          logger.appendLine(`INFO: Tool ${part.toolName} result received: ${JSON.stringify(part.result)}`);

          // @ts-ignore
          let formattedResult = part.result;
          if (typeof formattedResult === 'string') {
            try {
              formattedResult = JSON.parse(formattedResult);
            } catch (e) {
              // If parsing fails, use the original string
              // @ts-ignore
              formattedResult = part.result;
            }
          }
          // Create a special marker for tool results that will be processed by tool-call.js
          // @ts-ignore
          // Store the complete result object with full structure to allow proper extraction in tool-call.js
          const toolResultText = `<tool-result data-tool-name="${part.toolName}" data-counter="${toolCallCounter}">
          ${JSON.stringify(formattedResult)}
          </tool-result>`;

          updateResponse(toolResultText);
          chunks.push(toolResultText);
          break;
        }

        case "error": {
          // raise the error to be caught by the catch block
          throw new Error(`${part.error}`);
        }


        default: {
          logger.appendLine(
            `INFO: chatgpt.model: ${provider.model}, chatgpt.question: ${question.trim()}, debug response: ${JSON.stringify(part)}`,
          );
          break;
        }
      }
    }

    provider.response = chunks.join("");
    if (reasonChunks.join("") != "") {
      provider.reasoning = reasonChunks.join("");
    }
    const reasoning = await result.reasoning;
    if (reasoning && reasoning != "") {
      provider.reasoning = reasoning;
      updateReasoning(reasoning);
    }

    // Save both the text response and tool calls in the chat history
    const assistantResponse: any = {
      role: "assistant",
      content: chunks.join("")
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
