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
import { ConversationChain } from "langchain/chains";
import { OpenAI } from "langchain/llms/openai";
import { BufferMemory } from "langchain/memory";
import {
    ChatPromptTemplate as ChatPromptTemplatePackage,
    HumanMessagePromptTemplate,
    MessagesPlaceholder,
    SystemMessagePromptTemplate
} from "langchain/prompts";
import ChatGptViewProvider, { logger } from "./chatgpt-view-provider";

// initGptLegacyModel initializes the GPT legacy model.
export function initGptLegacyModel(viewProvider: ChatGptViewProvider, apiBaseUrl: string, apiKey: string, maxTokens: number, temperature: number, topP: number, organization: string) {
    if (apiBaseUrl?.includes("azure")) {
        const instanceName = apiBaseUrl.split(".")[0].split("//")[1];
        const deployName = apiBaseUrl.split("/")[apiBaseUrl.split("/").length - 1];
        viewProvider.apiCompletion = new OpenAI({
            modelName: viewProvider.model,
            azureOpenAIApiKey: apiKey,
            azureOpenAIApiInstanceName: instanceName,
            azureOpenAIApiDeploymentName: deployName,
            azureOpenAIApiCompletionsDeploymentName: deployName,
            azureOpenAIApiVersion: "2024-02-01",
            maxTokens: maxTokens,
            streaming: true,
            temperature: temperature,
            topP: topP,
        });
    } else {
        // OpenAI
        viewProvider.apiCompletion = new OpenAI({
            openAIApiKey: apiKey,
            modelName: viewProvider.model,
            maxTokens: maxTokens,
            streaming: true,
            temperature: temperature,
            topP: topP,
            configuration: {
                apiKey: apiKey,
                baseURL: apiBaseUrl,
                organization: organization,
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
