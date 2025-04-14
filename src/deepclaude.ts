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
import { CoreMessage, streamText } from "ai";
import ChatGptViewProvider from "./chatgpt-view-provider";
import { logger } from "./logger";
import { getHeaders } from "./model-config";

// reasoningChat performs reasoning + chat (e.g. DeepSeek + Claude).
export async function reasoningChat(
  provider: ChatGptViewProvider,
  question: string,
  images: Record<string, string>,
  startResponse: () => void,
  updateResponse: (message: string) => void,
  updateReasoning: (message: string) => void,
) {
  if (!provider.apiChat) {
    throw new Error("apiChat is undefined");
  }
  if (!provider.apiReasoning) {
    throw new Error("apiReasoning is undefined");
  }

  try {
    logger.appendLine(
      `INFO: deepclaude.model: ${provider.model}, reasoning.model: ${provider.reasoningModel}, question: ${question}`,
    );

    var chatMessage: CoreMessage = {
      role: "user",
      content: [
        {
          type: "text",
          text: question,
        },
      ],
    };

    /* placeholder for response */
    startResponse();
    // provider.chatHistory.push({ role: "user", content: provider.modelConfig.systemPrompt });
    provider.chatHistory.push(chatMessage);

    /* step 1: perform reasoning */
    let reasoningResult = "";
    {
      const chunks = [];
      const reasonChunks = [];
      let hasReasoning = false;
      let reasoningDone = false;
      const result = await streamText({
        model: provider.apiReasoning,
        messages: provider.chatHistory,
        maxTokens: provider.modelConfig.maxTokens,
        temperature: provider.modelConfig.temperature,
        abortSignal: provider.abortController?.signal,
        tools: provider.toolSet?.tools || undefined,
        headers: getHeaders(),
      });
      for await (const part of result.fullStream) {
        // logger.appendLine(`INFO: deepclaude.reasoning.model: ${provider.reasoningModel} deepclaude.question: ${question} response: ${JSON.stringify(part, null, 2)}`);
        if (reasoningDone) {
          // no need to process response after reasoning is done.
          break;
        }

        switch (part.type) {
          case "text-delta": {
            if (hasReasoning) {
              // Reasoning may be empty
              if (reasonChunks.join("").trim() == "") {
                hasReasoning = false;
              } else {
                reasoningDone = true;
              }
            } else {
              updateReasoning(part.textDelta);
              chunks.push(part.textDelta);
            }
            break;
          }
          case "reasoning": {
            hasReasoning = true;
            updateReasoning(part.textDelta);
            reasonChunks.push(part.textDelta);
            break;
          }
          case "error":
            provider.sendMessage({
              type: "addError",
              value: JSON.stringify(part.error, null, 2),
              autoScroll: provider.autoScroll,
            });
            break;

          default: {
            // logger.appendLine(`INFO: deepclaude.reasoning.model: ${provider.reasoningModel} deepclaude.question: ${question} response: ${JSON.stringify(part, null, 2)}`);
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

    logger.appendLine(
      `INFO: reasoning.model: ${provider.reasoningModel}, reasoning: ${reasoningResult}`,
    );

    if (reasoningResult.trim() == "") {
      provider.sendMessage({
        type: "addError",
        value: "Reasoning is empty.",
        autoScroll: provider.autoScroll,
      });
      return;
    }

    /* add reasoning to context */
    provider.chatHistory.push({
      role: "user",
      content: `Reasoning: ${reasoningResult}`,
    });

    /* add images after reasoning */
    Object.entries(images).forEach(([title, content]) => {
      provider.chatHistory.push({
        role: "user",
        content: [
          {
            type: "text",
            text: `Image: ${title}`,
          },
          {
            type: "image",
            image: content,
          },
        ],
      });
    });

    /* step 2: perform chat with reasoning in context */
    const chunks = [];
    const reasonChunks = [];
    const result = await streamText({
      system: provider.modelConfig.systemPrompt,
      model: provider.apiChat,
      messages: provider.chatHistory,
      maxTokens: provider.modelConfig.maxTokens,
      temperature: provider.modelConfig.temperature,
      abortSignal: provider.abortController?.signal,
      tools: provider.toolSet?.tools || undefined,
      maxSteps: provider.maxSteps,
      headers: getHeaders(),
    });
    for await (const part of result.fullStream) {
      // logger.appendLine(`INFO: deepclaude.model: ${provider.model} deepclaude.question: ${question} response: ${JSON.stringify(part, null, 2)}`);
      switch (part.type) {
        case "text-delta": {
          updateResponse(part.textDelta);
          chunks.push(part.textDelta);
          break;
        }
        case "reasoning": {
          updateReasoning(part.textDelta);
          reasonChunks.push(part.textDelta);
          break;
        }
        case "tool-call": {
          let formattedArgs = part.args;
          if (typeof formattedArgs === 'string') {
            try {
              formattedArgs = JSON.parse(formattedArgs);
            } catch (e) {
              // If parsing fails, use the original string
              // @ts-ignore
              formattedArgs = part.args;
            }
          }

          const toolCallText = `\nCalling tool ${part.toolName} with args\n\`\`\`json\n${JSON.stringify(formattedArgs, null, 2)}\n\`\`\`\n`;
          updateResponse(toolCallText);
          chunks.push(toolCallText);
          break;
        }

        // @ts-ignore
        case "tool-result": {
          // @ts-ignore
          logger.appendLine(`INFO: Tool ${part.toolName} result received: ${JSON.stringify(part.result)}`);

          // @ts-ignore
          let formattedResult = part.result;
          if (typeof formattedResult === 'string') {
            try {
              formattedResult = JSON.parse(formattedResult);
            } catch (e) {
              // If parsing fails, use the original string
              // @ts-ignore
              formattedResult = part.result;
            }
          }

          // @ts-ignore
          const toolResultText = `\nTool ${part.toolName} result:\n\`\`\`json\n${JSON.stringify(formattedResult, null, 2)}\n\`\`\`\n`;

          updateResponse(toolResultText);
          chunks.push(toolResultText);
          break;
        }

        case "error":
          provider.sendMessage({
            type: "addError",
            value: part.error,
            autoScroll: provider.autoScroll,
          });
          break;

        default: {
          logger.appendLine(
            `INFO: deepclaude.model: ${provider.model} deepclaude.question: ${question} response: ${JSON.stringify(part, null, 2)}`,
          );
          break;
        }
      }
    }

    provider.response = chunks.join("");
    provider.reasoning = reasonChunks.join("");

    // Save both the text response and tool calls in the chat history
    const assistantResponse: any = {
      role: "assistant",
      content: chunks.join("")
    };

    provider.chatHistory.push(assistantResponse);
    logger.appendLine(`INFO: deepclaude.response: ${provider.response}`);
  } catch (error) {
    logger.appendLine(
      `ERROR: deepclaude.model: ${provider.model} failed with error: ${error}, backtrace: ${new Error().stack}`,
    );
    throw error;
  }
}
