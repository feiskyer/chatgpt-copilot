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
import { isOpenAIOModel } from "./types";

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

        abortSignal: provider.abortController?.signal,
        tools: provider.toolSet?.tools || undefined,
        headers: getHeaders(),
        ...(isOpenAIOModel(provider.reasoningModel) && {
          providerOptions: {
            openai: {
              reasoningEffort: provider.reasoningEffort,
              maxCompletionTokens: provider.modelConfig.maxTokens,
            },
          },
        }),
        ...(!isOpenAIOModel(provider.reasoningModel) && {
          maxTokens: provider.modelConfig.maxTokens,
          temperature: provider.modelConfig.temperature,
          // topP: provider.modelConfig.topP,
        }),
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
    // Add a counter for tool calls to generate unique IDs
    let toolCallCounter = 0;
    const result = await streamText({
      system: provider.modelConfig.systemPrompt,
      model: provider.apiChat,
      messages: provider.chatHistory,
      abortSignal: provider.abortController?.signal,
      tools: provider.toolSet?.tools || undefined,
      maxSteps: provider.maxSteps,
      headers: getHeaders(),
      ...(isOpenAIOModel(provider.model ? provider.model : "") && {
        providerOptions: {
          openai: {
            reasoningEffort: provider.reasoningEffort,
            maxCompletionTokens: provider.modelConfig.maxTokens,
          },
        },
      }),
      ...(!isOpenAIOModel(provider.model ? provider.model : "") && {
        maxTokens: provider.modelConfig.maxTokens,
        temperature: provider.modelConfig.temperature,
        // topP: provider.modelConfig.topP,
      }),
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

          // Generate a unique ID for this tool call
          toolCallCounter++;
          const toolCallId = `tool-call-${Date.now()}-${toolCallCounter}`;

          // Create tool icon based on the tool name
          const toolIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="tool-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
</svg>`;

          // Create an enhanced collapsible HTML structure for the tool call
          const toolCallHtml = `
<div class="tool-call-block" id="${toolCallId}" data-tool-name="${part.toolName}" data-tool-counter="${toolCallCounter}">
  <div class="tool-call-header" onclick="toggleToolCall('${toolCallId}')">
    <svg class="tool-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M9 18l6-6-6-6"/>
    </svg>
    <div class="tool-info">
      ${toolIcon}
      <span class="tool-name">${part.toolName}</span>
    </div>
    <span class="tool-status status-running">Running</span>
  </div>
  <div class="tool-call-content collapsed">
    <div class="tool-call-args">
      <div class="args-header">
        <span class="section-label">Arguments</span>
        <button class="copy-button" onclick="copyToolArgs(this, '${toolCallId}')">Copy</button>
      </div>
      <pre><code class="language-json">${JSON.stringify(formattedArgs, null, 2)}</code></pre>
    </div>
    <div class="tool-call-result">
      <div class="tool-loading">
        <div class="tool-loading-spinner"></div>
        <span>Waiting for result...</span>
      </div>
    </div>
  </div>
</div>`;

          updateResponse(toolCallHtml);
          chunks.push(toolCallHtml);
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

          // Create a special marker for tool results that will be processed by tool-call.js
          // @ts-ignore
          // Store the complete result object with full structure to allow proper extraction in tool-call.js
          const toolResultText = `<tool-result data-tool-name="${part.toolName}" data-counter="${toolCallCounter}">
${JSON.stringify(formattedResult)}
</tool-result>`;

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
