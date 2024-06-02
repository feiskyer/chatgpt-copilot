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
import { ChatAnthropic } from "@langchain/anthropic";
import { AgentAction, AgentFinish } from "@langchain/core/agents";
import { RunnableWithMessageHistory } from "@langchain/core/runnables";
import { AgentExecutor } from "langchain/agents";
import { formatXml } from "langchain/agents/format_scratchpad/xml";
import { XMLAgentOutputParser } from "langchain/agents/xml/output_parser";
import { ChatPromptTemplate as ChatPromptTemplatePackage } from "langchain/prompts";
import { AgentStep } from "langchain/schema";
import { RunnableSequence } from "langchain/schema/runnable";
import { BingSerpAPI, GoogleCustomSearch, Serper, Tool } from "langchain/tools";
import { renderTextDescription } from "langchain/tools/render";
import ChatGptViewProvider from "./chatgpt-view-provider";
import { ModelConfig } from "./model-config";

// initClaudeModel initializes the Claude model with the given parameters.
export async function initClaudeModel(viewProvider: ChatGptViewProvider, config: ModelConfig) {
    const apiClaude = new ChatAnthropic({
        topP: config.topP,
        temperature: config.temperature,
        modelName: viewProvider.model,
        anthropicApiKey: config.apiKey,
        anthropicApiUrl: config.apiBaseUrl,
        streaming: true,
        maxTokens: config.maxTokens,
    }).bind({
        stop: ["</tool_input>", "</final_answer>"],
    });

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

    const systemContext = `You are ChatGPT helping the User with coding.
You are intelligent, helpful and an expert developer, who always gives the correct answer and only does what instructed.
You always answer truthfully and don't make things up. When responding to the following prompt, please make sure to
properly style your response using Github Flavored Markdown. Use markdown syntax for things like headings, lists, colored
text, code blocks, highlights etc. Make sure not to mention markdown or styling in your actual response.

You have access to the following tools:

{tools}

In order to use a tool, you can use <tool></tool> and <tool_input></tool_input> tags. \
You will then get back a response in the form <observation></observation>

For example, if you have a tool called 'search' that could run a google search, in order to search for the weather in SF you would respond:

<tool>search</tool><tool_input>weather in SF</tool_input>
<observation>64 degrees</observation>

When you are done, respond with a final answer between <final_answer></final_answer>. For example:

<final_answer>The weather in SF is 64 degrees</final_answer>

Ensure the final answer is in the same language as the question, unless otherwise specified by the question.
      `;

    const chatPrompt = ChatPromptTemplatePackage.fromMessages([
        ["human", systemContext],
        ["ai", "Chat history: {chat_history}"],
        ["human", "Question: {input}"],
        ["ai", "agent_scratchpad:{agent_scratchpad}"],
    ]);

    class CustomXMLAgentOutputParser extends XMLAgentOutputParser {
        public async parse(text: string): Promise<AgentAction | AgentFinish> {
            try {
                const steps = super.parse(text);
                return steps;
            } catch (error: any) {
                if (error.message.includes("Could not parse LLM output")) {
                    const msg = error.message.replace("Could not parse LLM output:", "");
                    const agentFinish: AgentFinish = {
                        returnValues: {
                            response: msg,
                        },
                        log: msg,
                    };
                    return agentFinish;
                } else {
                    // Re-throw the error if it's not the one we're looking for
                    throw error;
                }
            }
        }
    }

    const outputParser = new CustomXMLAgentOutputParser();
    const runnableAgent = RunnableSequence.from([
        {
            input: (i: { input: string; tools: Tool[]; steps: AgentStep[]; }) => i.input,
            tools: (i: { input: string; tools: Tool[]; steps: AgentStep[]; }) => renderTextDescription(i.tools),
            agent_scratchpad: (i: { input: string; tools: Tool[]; steps: AgentStep[]; }) => formatXml(i.steps),
            chat_history: async (_: { input: string; tools: Tool[]; steps: AgentStep[]; }) => {
                const histories = await viewProvider.memory?.getMessages();
                return histories?.map((message) => `${message._getType()}: ${message.content}`).join("\n");
            },
        },
        chatPrompt,
        apiClaude,
        outputParser,
    ]);
    const agentExecutor = AgentExecutor.fromAgentAndTools({
        agent: runnableAgent,
        tools,
    });
    viewProvider.tools = tools;
    viewProvider.chain = new RunnableWithMessageHistory({
        runnable: agentExecutor,
        getMessageHistory: (_sessionId) => config.messageHistory,
        inputMessagesKey: "input",
        historyMessagesKey: "chat_history",
    });
}
