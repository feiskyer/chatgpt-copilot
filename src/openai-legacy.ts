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
import { ModelMessage, streamText } from "ai";
import ChatGptViewProvider from "./chatgpt-view-provider";
import { logger } from "./logger";
import { ModelConfig, getHeaders } from "./model-config";

const azureAPIVersion = "2025-02-01-preview";

// initGptLegacyModel initializes the GPT legacy model.
export function initGptLegacyModel(
  viewProvider: ChatGptViewProvider,
  config: ModelConfig,
) {
  if (config.apiBaseUrl?.includes("openai.azure.com")) {
    const instanceName = config.apiBaseUrl.split(".")[0].split("//")[1];
    const deployName =
      config.apiBaseUrl.split("/")[config.apiBaseUrl.split("/").length - 1];

    viewProvider.model = deployName;
    const azure = createAzure({
      resourceName: instanceName,
      apiKey: config.apiKey,
      apiVersion: azureAPIVersion,
    });
    if (config.isReasoning) {
      viewProvider.apiReasoning = azure.completion(deployName);
    } else {
      viewProvider.apiCompletion = azure.completion(deployName);
    }
  } else {
    // OpenAI
    const openai = createOpenAI({
      baseURL: config.apiBaseUrl,
      apiKey: config.apiKey,
      organization: config.organization,
    });
    if (config.isReasoning) {
      viewProvider.apiReasoning = openai.completion(
        viewProvider.reasoningModel ? viewProvider.reasoningModel : "o1-mini",
      );
    } else {
      viewProvider.apiCompletion = openai.completion(
        viewProvider.model ? viewProvider.model : "gpt-4o",
      );
    }
  }
}

// chatCompletion is a function that completes the chat.
export async function chatCompletion(
  provider: ChatGptViewProvider,
  question: string,
  images: Record<string, string>,
  startResponse: () => void,
  updateResponse: (message: string) => void,
) {
  if (!provider.apiCompletion) {
    throw new Error("apiCompletion is not defined");
  }

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
  logger.appendLine(
    `INFO: chatgpt.model: ${provider.model} chatgpt.question: ${question}`,
  );

  provider.chatHistory.push(chatMessage);
  let prompt = "";
  for (const message of provider.chatHistory) {
    prompt += `${message.role === "user" ? "Human:" : "AI:"} ${message.content}\n`;
  }
  prompt += `AI: `;

  const result = streamText({
    system: provider.modelConfig.systemPrompt,
    model: provider.apiCompletion,
    prompt: prompt,
    maxOutputTokens: provider.modelConfig.maxTokens > 0 ? provider.modelConfig.maxTokens : undefined,
    temperature: provider.modelConfig.temperature,
    abortSignal: provider.abortController?.signal,
    tools: provider.toolSet?.tools || undefined,
    headers: getHeaders(),
  });
  const chunks = [];
  for await (const textPart of result.textStream) {
    updateResponse(textPart);
    chunks.push(textPart);
  }
  provider.response = chunks.join("");
  provider.chatHistory.push({ role: "assistant", content: chunks.join("") });
  logger.appendLine(`INFO: chatgpt.response: ${provider.response}`);
}
