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
import { CoreMessage, generateText, streamText } from 'ai';
import ChatGptViewProvider, { logger } from "./chatgpt-view-provider";
import { ModelConfig } from "./model-config";

// initGptModel initializes the GPT model.
export async function initGptModel(viewProvider: ChatGptViewProvider, config: ModelConfig) {
    // AzureOpenAI
    if (config.apiBaseUrl?.includes("openai.azure.com")) {
        const instanceName = config.apiBaseUrl.split(".")[0].split("//")[1];
        const deployName = config.apiBaseUrl.split("/")[config.apiBaseUrl.split("/").length - 1];

        viewProvider.model = deployName;
        const azure = createAzure({
            resourceName: instanceName,
            apiKey: config.apiKey,
        });
        viewProvider.apiChat = azure.chat(deployName);
    } else {
        // OpenAI
        const openai = createOpenAI({
            baseURL: config.apiBaseUrl,
            apiKey: config.apiKey,
            organization: config.organization,
        });
        viewProvider.apiChat = openai.chat(viewProvider.model ? viewProvider.model : "gpt-4o");
    }
}

// chatGpt is a function that completes the chat.
export async function chatGpt(provider: ChatGptViewProvider, question: string, images: Record<string, string>, updateResponse: (message: string) => void) {
    if (!provider.apiChat) {
        throw new Error("apiChat is undefined");
    }

    try {
        logger.appendLine(`INFO: chatgpt.model: ${provider.model} chatgpt.question: ${question}`);

        var chatMessage: CoreMessage = {
            role: "user",
            content: [
                {
                    type: "text",
                    text: question
                }
            ]
        };
        Object.entries(images).forEach(([_, content]) => {
            (chatMessage.content as any[]).push({
                type: "image",
                image: content
            });
        });

        if (provider.model?.startsWith("o1")) {
            // streaming not supported for o1 models
            if (provider.chatHistory.length <= 1) {
                provider.chatHistory.push(chatMessage);
            }
            provider.chatHistory.push({ role: "user", content: provider.modelConfig.systemPrompt });
            const result = await generateText({
                model: provider.apiChat,
                messages: provider.chatHistory,
            });

            updateResponse(result.text);
            provider.response = result.text;
            provider.chatHistory.push({ role: "assistant", content: result.text });
            logger.appendLine(`INFO: chatgpt.response: ${provider.response}`);
            return;
        }

        const chunks = [];
        provider.chatHistory.push(chatMessage);
        const result = await streamText({
            system: provider.modelConfig.systemPrompt,
            model: provider.apiChat,
            messages: provider.chatHistory,
            maxTokens: provider.modelConfig.maxTokens,
            topP: provider.modelConfig.topP,
            temperature: provider.modelConfig.temperature,
        });
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
    } catch (error) {
        logger.appendLine(`ERROR: chatgpt.model: ${provider.model} response: ${error}`);
        throw error;
    }
}
