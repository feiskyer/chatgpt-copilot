// llm_models/openai-legacy.ts

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

// initGptLegacyModel initializes the GPT legacy model.
export function initGptLegacyModel(viewProvider: ChatGptViewProvider, config: ModelConfig) {
    if (config.apiBaseUrl?.includes("azure")) {
        const instanceName = config.apiBaseUrl.split(".")[0].split("//")[1];
        const deployName = config.apiBaseUrl.split("/")[config.apiBaseUrl.split("/").length - 1];

        viewProvider.modelManager.model = deployName;
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
        viewProvider.apiCompletion = openai.completion(viewProvider.modelManager.model ? viewProvider.modelManager.model : "gpt-4o");
    }
}

// chatCompletion is a function that completes the chat.
export async function chatCompletion(
    provider: ChatGptViewProvider,
    question: string,
    updateResponse: (message: string) => void,
    additionalContext: string = "",
) {
    if (!provider.apiCompletion) {
        throw new Error("apiCompletion is not defined");
    }

    try {
        logger.log(LogLevel.Info, `chatgpt.model: ${provider.modelManager.model} chatgpt.question: ${question}`);

        // Add the user's question to the provider's chat history (without additionalContext)
        provider.chatHistory.push({ role: "user", content: question });

        // Create a temporary chat history, including the additionalContext
        const tempChatHistory = [...provider.chatHistory];
        const fullQuestion = additionalContext ? `${additionalContext}\n\n${question}` : question;
        tempChatHistory[tempChatHistory.length - 1] = { role: "user", content: fullQuestion }; // Replace the user's question with the full question in the temp history

        // Construct the prompt using the temporary chat history
        let prompt = "";
        for (const message of tempChatHistory) {
            prompt += `${message.role === "user" ? "Human:" : "AI:"} ${message.content}\n`;
        }
        prompt += `AI: `;

        // Generate the response using the temporary prompt
        const result = await streamText({
            system: provider.modelManager.modelConfig.systemPrompt,
            model: provider.apiCompletion,
            prompt: prompt,
            maxTokens: provider.modelManager.modelConfig.maxTokens,
            topP: provider.modelManager.modelConfig.topP,
            temperature: provider.modelManager.modelConfig.temperature,
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

        // Add the assistant's response to the provider's chat history (without additionalContext)
        provider.chatHistory.push({ role: "assistant", content: provider.response });

        logger.log(LogLevel.Info, `chatgpt.response: ${provider.response}`);
    } catch (error) {
        logger.log(LogLevel.Error, `chatgpt.model: ${provider.modelManager.model} response: ${error}`);
        throw error;
    }
}
