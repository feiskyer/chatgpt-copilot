// llm_models/openai.ts

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
import { ChatGptViewProvider } from "../chatgptViewProvider";
import { Logger, LogLevel } from "../logger";
import { ModelConfig } from "../model-config";

const logger = new Logger("ChatGPT Copilot");

// initGptModel initializes the GPT model.
export async function initGptModel(viewProvider: ChatGptViewProvider, config: ModelConfig) {
    // AzureOpenAI
    if (config.apiBaseUrl?.includes("azure")) {
        const instanceName = config.apiBaseUrl.split(".")[0].split("//")[1];
        const deployName = config.apiBaseUrl.split("/")[config.apiBaseUrl.split("/").length - 1];

        viewProvider.modelManager.model = deployName;
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
        viewProvider.apiChat = openai.chat(viewProvider.modelManager.model ? viewProvider.modelManager.model : "gpt-4o");
    }
}

// chatGpt is a function that completes the chat.
export async function chatGpt(
    provider: ChatGptViewProvider,
    question: string,
    updateResponse: (message: string) => void,
    additionalContext: string = "",
) {
    if (!provider.apiChat) {
        throw new Error("apiChat is undefined");
    }

    try {
        logger.log(LogLevel.Info, `chatgpt.model: ${provider.modelManager.model} chatgpt.question: ${question}`);

        // Add the user's question to the provider's chat history (without additionalContext)
        provider.chatHistory.push({ role: "user", content: question });

        // Create a temporary chat history, including the additionalContext
        const tempChatHistory = [...provider.chatHistory];

        // Prepend the additional context to the user's question in the temp chat history
        if (additionalContext) {
            const fullQuestion = `${additionalContext}\n\n${question}`;
            tempChatHistory[tempChatHistory.length - 1] = { role: "user", content: fullQuestion };
        }

        const chunks = [];
        const result = await streamText({
            system: provider.modelManager.modelConfig.systemPrompt,
            model: provider.apiChat,
            messages: tempChatHistory, // Use the temporary chat history with the additional context
            maxTokens: provider.modelManager.modelConfig.maxTokens,
            topP: provider.modelManager.modelConfig.topP,
            temperature: provider.modelManager.modelConfig.temperature,
        });

        // Process the streamed response
        for await (const textPart of result.textStream) {
            // logger.appendLine(
            //     `INFO: chatgpt.model: ${provider.model} chatgpt.question: ${question} response: ${JSON.stringify(textPart, null, 2)}`
            // );
            updateResponse(textPart);
            chunks.push(textPart);
        }
        provider.response = chunks.join("");

        // Add the assistant's response to the provider's chat history (without additionalContext)
        provider.chatHistory.push({ role: "assistant", content: chunks.join("") });

        logger.log(LogLevel.Info, `chatgpt.response: ${provider.response}`);
    } catch (error) {
        logger.log(LogLevel.Error, `chatgpt.model: ${provider.modelManager.model} response: ${error}`);
        throw error;
    }
}
