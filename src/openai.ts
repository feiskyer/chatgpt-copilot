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
import { CoreMessage, extractReasoningMiddleware, generateText, streamText, wrapLanguageModel } from 'ai';
import ChatGptViewProvider, { logger } from "./chatgpt-view-provider";
import { ModelConfig } from "./model-config";
import { isReasoningModel } from "./types";

// initGptModel initializes the GPT model.
export async function initGptModel(viewProvider: ChatGptViewProvider, config: ModelConfig) {
    // AzureOpenAI
    if (config.apiBaseUrl?.includes("openai.azure.com")) {
        const instanceName = config.apiBaseUrl.split(".")[0].split("//")[1];
        const deployName = config.apiBaseUrl.split("/")[config.apiBaseUrl.split("/").length - 1];

        const azure = createAzure({
            resourceName: instanceName,
            apiKey: config.apiKey,
        });

        if (config.isReasoning) {
            viewProvider.apiReasoning = wrapLanguageModel({
                model: azure.chat(deployName),
                middleware: extractReasoningMiddleware({ tagName: 'think' }),
            });
        } else {
            if (isReasoningModel(deployName)) {
                viewProvider.apiChat = wrapLanguageModel({
                    model: azure.chat(deployName),
                    middleware: extractReasoningMiddleware({ tagName: 'think' }),
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
        const model = viewProvider.model ? viewProvider.model : "gpt-4o";

        if (config.isReasoning) {
            viewProvider.apiReasoning = wrapLanguageModel({
                model: openai.chat(model),
                middleware: extractReasoningMiddleware({ tagName: 'think' }),
            });
        } else {
            if (isReasoningModel(model)) {
                viewProvider.apiChat = wrapLanguageModel({
                    model: openai.chat(model),
                    middleware: extractReasoningMiddleware({ tagName: 'think' }),
                });
            } else {
                viewProvider.apiChat = openai.chat(model);
            }
        }
    }
}

// chatGpt is a function that completes the chat.
export async function chatGpt(provider: ChatGptViewProvider, question: string, images: Record<string, string>, startResponse: () => void, updateResponse: (message: string) => void, updateReasoning: (message: string) => void) {
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

        /* placeholder for response */
        startResponse();

        if (provider.model?.startsWith("o1") || provider.model?.startsWith("o3")) {
            // streaming not supported for o1/o3 models
            if (provider.chatHistory.length <= 1) {
                provider.chatHistory.push(chatMessage);
            }
            provider.chatHistory.push({ role: "user", content: provider.modelConfig.systemPrompt });
            const result = await generateText({
                model: provider.apiChat,
                messages: provider.chatHistory,
                abortSignal: provider.abortController?.signal,
                tools: provider.toolSet?.tools || undefined,
                maxSteps: provider.maxSteps,
            });

            updateReasoning(result.reasoning ?? "");
            updateResponse(result.text);
            provider.reasoning = result.reasoning ?? "";
            provider.response = result.text;
            provider.chatHistory.push({ role: "assistant", content: result.text });
            logger.appendLine(`INFO: chatgpt.response: ${provider.response}`);
            return;
        }

        const chunks = [];
        const reasonChunks = [];
        provider.chatHistory.push(chatMessage);
        const result = await streamText({
            system: provider.modelConfig.systemPrompt,
            model: provider.apiChat,
            messages: provider.chatHistory,
            maxTokens: provider.modelConfig.maxTokens,
            topP: provider.modelConfig.topP,
            temperature: provider.modelConfig.temperature,
            abortSignal: provider.abortController?.signal,
            tools: provider.toolSet?.tools || undefined,
            maxSteps: provider.maxSteps,
        });
        for await (const part of result.fullStream) {
            // logger.appendLine(`INFO: chatgpt.model: ${provider.model} chatgpt.question: ${question} response: ${JSON.stringify(part, null, 2)}`);
            switch (part.type) {
                case 'text-delta': {
                    updateResponse(part.textDelta);
                    chunks.push(part.textDelta);
                    break;
                }
                case 'reasoning': {
                    updateReasoning(part.textDelta);
                    reasonChunks.push(part.textDelta);
                    break;
                }
                case 'tool-call': {
                    updateResponse(`${part.toolName}...`);
                    break;
                }
                case 'error':
                    provider.sendMessage({
                        type: "addError",
                        value: part.error,
                        autoScroll: provider.autoScroll,
                    });
                    break;

                default: {
                    logger.appendLine(`INFO: chatgpt.model: ${provider.model}, chatgpt.question: ${question}, debug response: ${JSON.stringify(part, null, 2)}`);
                    break;
                }
            }
        }

        provider.response = chunks.join("");
        provider.reasoning = reasonChunks.join("");
        provider.chatHistory.push({ role: "assistant", content: chunks.join("") });
        logger.appendLine(`INFO: chatgpt.model: ${provider.model}, chatgpt.question: ${question}, final response: ${provider.response}`);
    } catch (error) {
        logger.appendLine(`ERROR: chatgpt.model: ${provider.model} error: ${error}`);
        throw error;
    }
}
