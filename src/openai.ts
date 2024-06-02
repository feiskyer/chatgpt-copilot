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
import { RunnableWithMessageHistory } from "@langchain/core/runnables";
import { OpenAIEmbeddings } from "@langchain/openai";
import { AgentExecutor, createOpenAIFunctionsAgent } from "langchain/agents";
import { ChatOpenAI } from "langchain/chat_models/openai";
import {
    ChatPromptTemplate as ChatPromptTemplatePackage,
    HumanMessagePromptTemplate,
    MessagesPlaceholder,
    SystemMessagePromptTemplate
} from "langchain/prompts";
import { BingSerpAPI, GoogleCustomSearch, Serper, Tool } from "langchain/tools";
import { WebBrowser } from "langchain/tools/webbrowser";
import ChatGptViewProvider, { logger } from "./chatgpt-view-provider";
import { ModelConfig } from "./model-config";

// initGptModel initializes the GPT model.
export async function initGptModel(viewProvider: ChatGptViewProvider, config: ModelConfig) {
    let tools: Tool[] = [];
    if (config.googleCSEApiKey != "" && config.googleCSEId != "") {
        tools.push(new GoogleCustomSearch({
            apiKey: config.googleCSEApiKey,
            googleCSEId: config.googleCSEId,
        }));
    }
    if (config.serperKey != "") {
        tools.push(new Serper(config.serperKey));
    }
    if (config.bingKey != "") {
        tools.push(new BingSerpAPI(config.bingKey));
    }

    let embeddings = new OpenAIEmbeddings({
        modelName: "text-embedding-ada-002",
        openAIApiKey: config.apiKey,
    });
    // AzureOpenAI
    if (config.apiBaseUrl?.includes("azure")) {
        const instanceName = config.apiBaseUrl.split(".")[0].split("//")[1];
        const deployName = config.apiBaseUrl.split("/")[config.apiBaseUrl.split("/").length - 1];
        embeddings = new OpenAIEmbeddings({
            azureOpenAIApiEmbeddingsDeploymentName: "text-embedding-ada-002",
            azureOpenAIApiKey: config.apiKey,
            azureOpenAIApiInstanceName: instanceName,
            azureOpenAIApiDeploymentName: deployName,
            azureOpenAIApiCompletionsDeploymentName: deployName,
            azureOpenAIApiVersion: "2024-02-01",
        });
        viewProvider.apiChat = new ChatOpenAI({
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
        viewProvider.apiChat = new ChatOpenAI({
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

    tools.push(new WebBrowser({
        model: viewProvider.apiChat,
        embeddings: embeddings,
    }));

    const systemContext = `Your task is to embody the role of an intelligent, helpful, and expert developer.
You MUST provide accurate and truthful answers, adhering strictly to the instructions given.
Your responses should be styled using Github Flavored Markdown for elements such as headings,
lists, colored text, code blocks, and highlights. However, you MUST NOT mention markdown or
styling directly in your response. Utilize available tools to supplement your knowledge
where necessary. Respond in the same language as the query, unless otherwise specified by the user.`;
    const chatPrompt = ChatPromptTemplatePackage.fromMessages([
        SystemMessagePromptTemplate.fromTemplate(systemContext),
        new MessagesPlaceholder("chat_history"),
        HumanMessagePromptTemplate.fromTemplate("{input}"),
        new MessagesPlaceholder("agent_scratchpad"),
    ]);
    const agent = await createOpenAIFunctionsAgent({
        llm: viewProvider.apiChat,
        tools: tools,
        prompt: chatPrompt,
    });

    const agentExecutor = new AgentExecutor({ agent, tools });
    viewProvider.tools = tools;
    viewProvider.chain = new RunnableWithMessageHistory({
        runnable: agentExecutor,
        getMessageHistory: (_sessionId) => config.messageHistory,
        inputMessagesKey: "input",
        historyMessagesKey: "chat_history",
    });
}

// chatGpt is a function that completes the chat.
export async function chatGpt(provider: ChatGptViewProvider, question: string, updateResponse: (message: string) => void, tools: Tool[] = []) {
    const stream = await provider.chain?.stream({
        input: question,
        tools: provider.tools,
        signal: provider.abortController?.signal,
    }, {
        "configurable": {
            "sessionId": provider.conversationId,
        }
    });
    if (stream) {
        const chunks = [];
        for await (const chunk of stream) {
            logger.appendLine(
                `INFO: chatgpt.model: ${provider.model} chatgpt.question: ${question} response: ${JSON.stringify(chunk, null, 2)}`
            );

            if (chunk["intermediateSteps"] != null) {
                const intermediateSteps = chunk["intermediateSteps"];
                for (const step of intermediateSteps) {
                    // const stepMessage = `Observation: ${step.observation}, tool: ${step.action.tool}\r\n`;
                    const stepMessage = `${step.action.tool}...\r\n\r\n`;
                    updateResponse(stepMessage);
                    chunks.push(stepMessage);
                }
            }

            if (chunk["output"] != null) {
                updateResponse(chunk["output"]);
                chunks.push(chunk["output"]);
            }

        }
        provider.response = chunks.join("");
    }
}
