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
import { ModelConfig, getHeaders } from "./model-config";
import { isOpenAIOModel, isReasoningModel } from "./types";

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
    });

    if (config.isReasoning) {
      viewProvider.apiReasoning = wrapLanguageModel({
        model: azure.chat(deployName),
        middleware: extractReasoningMiddleware({ tagName: "think" }),
      });
    } else {
      if (isReasoningModel(deployName)) {
        viewProvider.apiChat = wrapLanguageModel({
          model: azure.chat(deployName),
          middleware: extractReasoningMiddleware({ tagName: "think" }),
        });
      } else {
        viewProvider.apiChat = azure.chat(deployName);
      }
    }
  } else {
    // OpenAI
    const openai = createOpenAI({
      baseURL: config.apiBaseUrl,
      apiKey: config.apiKey,
      organization: config.organization,
    });

    if (config.isReasoning) {
      const model = viewProvider.reasoningModel
        ? viewProvider.reasoningModel
        : "o3-mini";
      viewProvider.apiReasoning = wrapLanguageModel({
        model: openai.chat(model),
        middleware: extractReasoningMiddleware({ tagName: "think" }),
      });
    } else {
      const model = viewProvider.model ? viewProvider.model : "gpt-4o";
      if (isReasoningModel(model)) {
        viewProvider.apiChat = wrapLanguageModel({
          model: openai.chat(model),
          middleware: extractReasoningMiddleware({ tagName: "think" }),
        });
      } else {
        viewProvider.apiChat = openai.chat(model);
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
    provider.chatHistory.push(chatMessage);
    var inputs: any = {
      system: provider.modelConfig.systemPrompt,
      model: provider.apiChat,
      messages: provider.chatHistory,
      abortSignal: provider.abortController?.signal,
      tools: provider.toolSet?.tools || undefined,
      maxSteps: provider.maxSteps,
      headers: getHeaders(),
      ...(isOpenAIOModel(provider.model ? provider.model : "") && {
        providerOptions: {
          openai: {
            reasoningEffort: provider.reasoningEffort,
            maxCompletionTokens: provider.modelConfig.maxTokens,
          },
        },
      }),
      ...(!isOpenAIOModel(provider.model ? provider.model : "") && {
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

          const toolCallText = `\nCalling tool ${part.toolName} with args\n\`\`\`json\n${JSON.stringify(formattedArgs, null, 2)}\n\`\`\`\n`;
          updateResponse(toolCallText);
          chunks.push(toolCallText);
          break;
        }

        // @ts-ignore
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

          // @ts-ignore
          const toolResultText = `\nTool ${part.toolName} result:\n\`\`\`json\n${JSON.stringify(formattedResult, null, 2)}\n\`\`\`\n`;

          updateResponse(toolResultText);
          chunks.push(toolResultText);
          break;
        }

        case "error":
          provider.sendMessage({
            type: "addError",
            value: part.error,
            autoScroll: provider.autoScroll,
          });
          break;

        default: {
          logger.appendLine(
            `INFO: chatgpt.model: ${provider.model}, chatgpt.question: ${question.trim()}, debug response: ${JSON.stringify(part)}`,
          );
          break;
        }
      }
    }

    provider.response = chunks.join("");
    provider.reasoning = reasonChunks.join("");

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
    throw error;
  }
}
