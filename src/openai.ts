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

// initGptModel initializes the GPT model.
export async function initGptModel(viewProvider: ChatGptViewProvider, config: ModelConfig) {
    // let tools: Tool[] = [
    //     new WikipediaQueryRun({
    //         topKResults: 3,
    //         maxDocContentLength: 4000,
    //     })
    // ];
    // if (config.googleCSEApiKey != "" && config.googleCSEId != "") {
    //     tools.push(new GoogleCustomSearch({
    //         apiKey: config.googleCSEApiKey,
    //         googleCSEId: config.googleCSEId,
    //     }));
    // }
    // if (config.serperKey != "") {
    //     tools.push(new Serper(config.serperKey));
    // }
    // if (config.bingKey != "") {
    //     tools.push(new BingSerpAPI(config.bingKey));
    // }

    // let embeddings = new OpenAIEmbeddings({
    //     modelName: "text-embedding-ada-002",
    //     openAIApiKey: config.apiKey,
    // });

    // AzureOpenAI
    if (config.apiBaseUrl?.includes("azure")) {
        const instanceName = config.apiBaseUrl.split(".")[0].split("//")[1];
        const deployName = config.apiBaseUrl.split("/")[config.apiBaseUrl.split("/").length - 1];

        viewProvider.model = deployName;
        const azure = createAzure({
            resourceName: instanceName,
            apiKey: config.apiKey,
        });
        viewProvider.apiChat = azure.chat(deployName);

        // embeddings = new OpenAIEmbeddings({
        //     azureOpenAIApiEmbeddingsDeploymentName: "text-embedding-ada-002",
        //     azureOpenAIApiKey: config.apiKey,
        //     azureOpenAIApiInstanceName: instanceName,
        //     azureOpenAIApiDeploymentName: deployName,
        //     azureOpenAIApiCompletionsDeploymentName: deployName,
        //     azureOpenAIApiVersion: "2024-02-01",
        // });
        // viewProvider.apiChat = new ChatOpenAI({
        //     modelName: viewProvider.model,
        //     azureOpenAIApiKey: config.apiKey,
        //     azureOpenAIApiInstanceName: instanceName,
        //     azureOpenAIApiDeploymentName: deployName,
        //     azureOpenAIApiCompletionsDeploymentName: deployName,
        //     azureOpenAIApiVersion: "2024-02-01",
        //     maxTokens: config.maxTokens,
        //     streaming: true,
        //     temperature: config.temperature,
        //     topP: config.topP,
        // });
    } else {
        // OpenAI
        const openai = createOpenAI({
            baseURL: config.apiBaseUrl,
            apiKey: config.apiKey,
            organization: config.organization,
        });
        viewProvider.apiChat = openai.chat(viewProvider.model ? viewProvider.model : "gpt-4o");

        // viewProvider.apiChat = new ChatOpenAI({
        //     openAIApiKey: config.apiKey,
        //     modelName: viewProvider.model,
        //     maxTokens: config.maxTokens,
        //     streaming: true,
        //     temperature: config.temperature,
        //     topP: config.topP,
        //     configuration: {
        //         apiKey: config.apiKey,
        //         baseURL: config.apiBaseUrl,
        //         organization: config.organization,
        //     },
        // });
    }

    // if (config.apiBaseUrl == "https://api.openai.com/v1") {
    //     tools.push(new WebBrowser({
    //         model: viewProvider.apiChat,
    //         embeddings: embeddings,
    //     }));
    // }


    // const chatPrompt = ChatPromptTemplatePackage.fromMessages([
    //     SystemMessagePromptTemplate.fromTemplate(systemContext),
    //     new MessagesPlaceholder("chat_history"),
    //     HumanMessagePromptTemplate.fromTemplate("{input}"),
    //     new MessagesPlaceholder("agent_scratchpad"),
    // ]);
    // const agent = await createOpenAIFunctionsAgent({
    //     llm: viewProvider.apiChat,
    //     tools: tools,
    //     prompt: chatPrompt,
    // });

    // const agentExecutor = new AgentExecutor({ agent, tools });
    // viewProvider.tools = tools;
    // viewProvider.chain = new RunnableWithMessageHistory({
    //     runnable: agentExecutor,
    //     getMessageHistory: (_sessionId) => config.messageHistory,
    //     inputMessagesKey: "input",
    //     historyMessagesKey: "chat_history",
    // });
}

// chatGpt is a function that completes the chat.
export async function chatGpt(provider: ChatGptViewProvider, question: string, updateResponse: (message: string) => void) {
    if (!provider.apiChat) {
        throw new Error("apiChat is undefined");
    }

    logger.appendLine(`INFO: chatgpt.model: ${provider.model} chatgpt.question: ${question}`);
    provider.chatHistory.push({ role: "user", content: question });

    const chunks = [];
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
}
