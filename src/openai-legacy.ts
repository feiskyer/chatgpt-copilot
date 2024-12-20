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
import { createAzure } from '@ai-sdk/azure';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import ChatGptViewProvider, { logger } from "./chatgpt-view-provider";
import { ModelConfig } from "./model-config";

// initGptLegacyModel initializes the GPT legacy model.
export function initGptLegacyModel(viewProvider: ChatGptViewProvider, config: ModelConfig) {
    if (config.apiBaseUrl?.includes("openai.azure.com")) {
        const instanceName = config.apiBaseUrl.split(".")[0].split("//")[1];
        const deployName = config.apiBaseUrl.split("/")[config.apiBaseUrl.split("/").length - 1];

        viewProvider.model = deployName;
        const azure = createAzure({
            resourceName: instanceName,
            apiKey: config.apiKey,
        });
        viewProvider.apiCompletion = azure.completion(deployName);
    } else {
        // OpenAI
        const openai = createOpenAI({
            baseURL: config.apiBaseUrl,
            apiKey: config.apiKey,
            organization: config.organization,
        });
        viewProvider.apiCompletion = openai.completion(viewProvider.model ? viewProvider.model : "gpt-4o");
    }
}

// chatCompletion is a function that completes the chat.
export async function chatCompletion(provider: ChatGptViewProvider, question: string, updateResponse: (message: string) => void) {
    if (!provider.apiCompletion) {
        throw new Error("apiCompletion is not defined");
    }

    logger.appendLine(`INFO: chatgpt.model: ${provider.model} chatgpt.question: ${question}`);
    provider.chatHistory.push({ role: "user", content: question });
    let prompt = "";
    for (const message of provider.chatHistory) {
        prompt += `${message.role === "user" ? "Human:" : "AI:"} ${message.content}\n`;
    }
    prompt += `AI: `;

    const result = await streamText({
        system: provider.modelConfig.systemPrompt,
        model: provider.apiCompletion,
        prompt: prompt,
        maxTokens: provider.modelConfig.maxTokens,
        topP: provider.modelConfig.topP,
        temperature: provider.modelConfig.temperature,
    });
    const chunks = [];
    for await (const textPart of result.textStream) {
        // logger.appendLine(
        //     `INFO: chatgpt.model: ${provider.model} chatgpt.question: ${question} response: ${JSON.stringify(textPart, null, 2)}`
        // );
        updateResponse(textPart);
        chunks.push(textPart);
    }
    provider.response = chunks.join("");
    provider.chatHistory.push({ role: "assistant", content: chunks.join("") });
    logger.appendLine(`INFO: chatgpt.response: ${provider.response}`);
}
