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
import {
    ChatPromptTemplate as ChatPromptTemplatePackage,
    HumanMessagePromptTemplate,
    MessagesPlaceholder,
    SystemMessagePromptTemplate
} from "@langchain/core/prompts";
import { OpenAI } from "@langchain/openai";
import { ConversationChain } from "langchain/chains";
import { BufferMemory } from "langchain/memory";
import ChatGptViewProvider, { logger } from "./chatgpt-view-provider";
import { ModelConfig } from "./model-config";

// initGptLegacyModel initializes the GPT legacy model.
export function initGptLegacyModel(viewProvider: ChatGptViewProvider, config: ModelConfig) {
    if (config.apiBaseUrl?.includes("azure")) {
        const instanceName = config.apiBaseUrl.split(".")[0].split("//")[1];
        const deployName = config.apiBaseUrl.split("/")[config.apiBaseUrl.split("/").length - 1];
        viewProvider.apiCompletion = new OpenAI({
            modelName: viewProvider.model,
            azureOpenAIApiKey: config.apiKey,
            azureOpenAIApiInstanceName: instanceName,
            azureOpenAIApiDeploymentName: deployName,
            azureOpenAIApiCompletionsDeploymentName: deployName,
            azureOpenAIApiVersion: "2024-02-01",
            maxTokens: config.maxTokens,
            streaming: true,
            temperature: config.temperature,
            topP: config.topP,
        });
    } else {
        // OpenAI
        viewProvider.apiCompletion = new OpenAI({
            openAIApiKey: config.apiKey,
            modelName: viewProvider.model,
            maxTokens: config.maxTokens,
            streaming: true,
            temperature: config.temperature,
            topP: config.topP,
            configuration: {
                apiKey: config.apiKey,
                baseURL: config.apiBaseUrl,
                organization: config.organization,
            },
        });
    }

    const systemContext = `You are ChatGPT helping the User with coding.
			You are intelligent, helpful and an expert developer, who always gives the correct answer and only does what instructed. You always answer truthfully and don't make things up.
			(When responding to the following prompt, please make sure to properly style your response using Github Flavored Markdown.
			Use markdown syntax for things like headings, lists, colored text, code blocks, highlights etc. Make sure not to mention markdown or styling in your actual response.)`;
    const chatPrompt = ChatPromptTemplatePackage.fromMessages([
        SystemMessagePromptTemplate.fromTemplate(systemContext),
        new MessagesPlaceholder("history"),
        HumanMessagePromptTemplate.fromTemplate("{input}"),
    ]);
    const chatMemory = new BufferMemory({
        returnMessages: true,
        memoryKey: "history",
    });
    viewProvider.llmChain = new ConversationChain({
        memory: chatMemory,
        prompt: chatPrompt,
        llm: viewProvider.apiCompletion,
    });
}

// chatCompletion is a function that completes the chat.
export async function chatCompletion(provider: ChatGptViewProvider, question: string, updateResponse: (message: string) => void) {
    const gptResponse = await provider.llmChain?.call(
        {
            input: question,
            signal: provider.abortController?.signal,
        },
        [
            {
                handleLLMNewToken(token: string) {
                    updateResponse(token);
                },
                handleLLMError(err: any, runId: any, parentRunId: any) {
                    logger.appendLine(`Error in LLM: ${err.message}`);
                },
            },
        ]
    );
    provider.response = gptResponse?.response;
}
