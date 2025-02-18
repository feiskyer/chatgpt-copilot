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
import { CoreMessage, generateText, streamText } from 'ai';
import ChatGptViewProvider, { logger } from "./chatgpt-view-provider";

// reasoningChat performs reasoning + chat (e.g. DeepSeek + Claude).
export async function reasoningChat(provider: ChatGptViewProvider, question: string, images: Record<string, string>, startResponse: () => void, updateResponse: (message: string) => void, updateReasoning: (message: string) => void) {
    if (!provider.apiChat) {
        throw new Error("apiChat is undefined");
    }
    if (!provider.apiReasoning) {
        throw new Error("apiReasoning is undefined");
    }

    logger.appendLine(`INFO: debug ${JSON.stringify(provider.reasoningModelConfig, null, 2)}`);

    try {
        logger.appendLine(`INFO: chatgpt.model: ${provider.model}, reasoning.model: ${provider.reasoningModel}, chatgpt.question: ${question}`);

        var chatMessage: CoreMessage = {
            role: "user",
            content: [
                {
                    type: "text",
                    text: question
                }
            ]
        };

        /* placeholder for response */
        startResponse();
        provider.chatHistory.push(chatMessage);
        /* do not add system prompt for reasoning step */
        // provider.chatHistory.push({ role: "user", content: provider.modelConfig.systemPrompt });

        /* step 1: perform reasoning */
        let reasoningResult = "";
        if (provider.reasoningModel?.startsWith("o1") || provider.reasoningModel?.startsWith("o3")) {
            // streaming not supported for o1/o3 models
            const result = await generateText({
                model: provider.apiReasoning,
                messages: provider.chatHistory,
            });
            if (result.reasoning) {
                reasoningResult = result.reasoning;
                updateReasoning(result.reasoning ?? "");
            } else {
                // use response if reasoning is not available.
                reasoningResult = result.text;
                updateReasoning(result.text ?? "");
            }
        } else {
            const chunks = [];
            const reasonChunks = [];
            let hasReasoning = false;
            let reasoningDone = false;
            const result = await streamText({
                model: provider.apiReasoning,
                messages: provider.chatHistory,
                maxTokens: provider.modelConfig.maxTokens,
                topP: provider.modelConfig.topP,
                temperature: provider.modelConfig.temperature,
            });
            for await (const part of result.fullStream) {
                // logger.appendLine(`INFO: reasoning.model: ${provider.reasoningModel} chatgpt.question: ${question} response: ${JSON.stringify(part, null, 2)}`);
                if (reasoningDone) {
                    // no need to process response after reasoning is done.
                    break;
                }

                switch (part.type) {
                    case 'text-delta': {
                        if (hasReasoning) {
                            reasoningDone = true;
                        } else {
                            updateReasoning(part.textDelta);
                            chunks.push(part.textDelta);
                        }
                        break;
                    }
                    case 'reasoning': {
                        hasReasoning = true;
                        updateReasoning(part.textDelta);
                        reasonChunks.push(part.textDelta);
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
                        // logger.appendLine(`INFO: reasoning.model: ${provider.reasoningModel} chatgpt.question: ${question} response: ${JSON.stringify(part, null, 2)}`);
                        break;
                    }
                }
            }

            if (hasReasoning) {
                reasoningResult = reasonChunks.join("");
            } else {
                reasoningResult = chunks.join("");
            }
        }

        logger.appendLine(`INFO: reasoning.model: ${provider.reasoningModel}, reasoning: ${reasoningResult}`);

        /* add reasoning to context */
        provider.chatHistory.push({ role: "user", content: reasoningResult });

        /* add images after reasoning */
        Object.entries(images).forEach(([_, content]) => {
            (chatMessage.content as any[]).push({
                type: "image",
                image: content
            });
        });

        /* step 2: perform chat with reasoning in context */
        if (provider.model?.startsWith("o1") || provider.model?.startsWith("o3")) {
            // streaming not supported for o1/o3 models
            const result = await generateText({
                // system: provider.modelConfig.systemPrompt,
                model: provider.apiChat,
                messages: provider.chatHistory,
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
        const result = await streamText({
            system: provider.modelConfig.systemPrompt,
            model: provider.apiChat,
            messages: provider.chatHistory,
            maxTokens: provider.modelConfig.maxTokens,
            topP: provider.modelConfig.topP,
            temperature: provider.modelConfig.temperature,
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
                case 'error':
                    provider.sendMessage({
                        type: "addError",
                        value: part.error,
                        autoScroll: provider.autoScroll,
                    });
                    break;

                default: {
                    // logger.appendLine(`INFO: chatgpt.model: ${provider.model} chatgpt.question: ${question} response: ${JSON.stringify(part, null, 2)}`);
                    break;
                }
            }
        }

        provider.response = chunks.join("");
        provider.reasoning = reasonChunks.join("");
        provider.chatHistory.push({ role: "assistant", content: chunks.join("") });
        logger.appendLine(`INFO: chatgpt.response: ${provider.response}`);
    } catch (error) {
        logger.appendLine(`ERROR: chatgpt.model: ${provider.model} response: ${error}`);
        throw error;
    }
}
