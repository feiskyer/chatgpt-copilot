import { ModelMessage } from "ai";
import * as vscode from "vscode";
import ChatGptViewProvider from "./chatgpt-view-provider";
import { logger } from "./logger";
import {
  executePromptToolCall,
  generateToolDescriptions,
} from "./prompt-based-tools";
import { ToolCallParser } from "./tool-call-parser";
import { PromptBasedToolConfig } from "./types";

/**
 * Get prompt-based tool configuration from VSCode settings
 */
function getPromptBasedToolConfig(): PromptBasedToolConfig {
  const configuration = vscode.workspace.getConfiguration("chatgpt");

  return {
    enabled: true, // Always true for GitHub Copilot
    toolCallPattern: "<tool_call>",
    maxToolCalls: configuration.get("gpt3.maxSteps") || 15,
  };
}

export async function chatCopilot(
  provider: ChatGptViewProvider,
  question: string,
  images: Record<string, string>,
  startResponse: () => void,
  updateResponse: (message: string) => void,
  updateReasoning?: (message: string, roundNumber?: number) => void,
) {
  logger.appendLine(
    `INFO: chatgpt.model: ${provider.model} chatgpt.question: ${question.trim()}`,
  );

  const promptToolConfig = getPromptBasedToolConfig();
  logger.appendLine(
    `INFO: Using prompt-based tools: ${promptToolConfig.enabled}, model: ${provider.model}`,
  );

  const models = await vscode.lm.selectChatModels({
    vendor: "copilot",
  });
  logger.appendLine(
    `INFO: available Github copilot models: ${models.map((m) => m.family).join(", ")}`,
  );
  if (models.length === 0) {
    provider.sendMessage({
      type: "addError",
      value: `No supported models found from Github Copilot, have you logged in?`,
      autoScroll: provider.autoScroll,
    });
    return;
  }

  let model: vscode.LanguageModelChat | undefined;
  try {
    [model] = await vscode.lm.selectChatModels({
      vendor: "copilot",
      family: provider.model,
    });
  } catch (err) {
    provider.sendMessage({
      type: "addError",
      value: JSON.stringify(err, null, 2),
      autoScroll: provider.autoScroll,
    });
    logger.appendLine(`ERROR: ${err}`);
    return;
  }

  if (!model) {
    provider.sendMessage({
      type: "addError",
      value: `Model ${provider.model} not supported.`,
      autoScroll: provider.autoScroll,
    });
    logger.appendLine(`ERROR: Model ${provider.model} not supported.`);
    return;
  }

  var chatMessage: ModelMessage = {
    role: "user",
    content: question,
  };

  /* placeholder for response */
  startResponse();

  const chunks: string[] = [];
  const reasonChunks: string[] = [];
  let toolCallCounter = 0;
  provider.chatHistory.push(chatMessage);

  // Prepare system prompt with tool descriptions if using prompt-based tools
  let systemPrompt = provider.modelConfig.systemPrompt;
  if (provider.toolSet) {
    const toolDescriptions = generateToolDescriptions(provider.toolSet);
    if (toolDescriptions) {
      systemPrompt = systemPrompt
        ? `${systemPrompt}\n\n${toolDescriptions}`
        : toolDescriptions;
      logger.appendLine(`INFO: Added tool descriptions to system prompt`);
    }
  }

  // Implement tool call loop for prompt-based tools (like AI SDK does automatically)
  if (provider.toolSet) {
    toolCallCounter = await executeGitHubCopilotToolLoop(
      provider,
      model,
      systemPrompt,
      chunks,
      reasonChunks,
      toolCallCounter,
      updateResponse,
      updateReasoning,
    );
  } else {
    // Use standard GitHub Copilot without tools
    toolCallCounter = await executeStandardGitHubCopilotChat(
      provider,
      model,
      systemPrompt,
      chunks,
      reasonChunks,
      toolCallCounter,
      updateResponse,
      updateReasoning,
    );
  }

  provider.response = chunks.join("");
  if (reasonChunks.join("") !== "") {
    provider.reasoning = reasonChunks.join("");
  }

  logger.appendLine(
    `INFO: chatgpt.model: ${provider.model}, chatgpt.question: ${question.trim()}, final response: ${provider.response}`,
  );
}

/**
 * Execute GitHub Copilot tool loop (mimics AI SDK's automatic tool calling)
 */
async function executeGitHubCopilotToolLoop(
  provider: ChatGptViewProvider,
  model: vscode.LanguageModelChat,
  systemPrompt: string,
  chunks: string[],
  reasonChunks: string[],
  toolCallCounter: number,
  updateResponse: (message: string) => void,
  updateReasoning?: (message: string, roundNumber?: number) => void,
): Promise<number> {
  const maxSteps = provider.maxSteps || 15;
  let currentStep = 0;
  let conversationHistory = [...provider.chatHistory];

  while (currentStep < maxSteps) {
    currentStep++;
    logger.appendLine(
      `INFO: GitHub Copilot tool loop step ${currentStep}/${maxSteps}`,
    );

    // Prepare messages with system prompt
    const messagesWithSystem = [
      { role: "system" as const, content: systemPrompt },
      ...conversationHistory,
    ];
    const messages = convertToLMChatMessages(messagesWithSystem);

    // Make API call
    let chatResponse: vscode.LanguageModelChatResponse;
    try {
      const cancellationTokenSource = new vscode.CancellationTokenSource();
      // If we have an abort controller, listen to it and cancel the token
      if (provider.abortController) {
        provider.abortController.signal.addEventListener("abort", () => {
          cancellationTokenSource.cancel();
        });
      }

      chatResponse = await model.sendRequest(
        messages,
        {},
        cancellationTokenSource.token,
      );
    } catch (err) {
      provider.sendMessage({
        type: "addError",
        value: JSON.stringify(err, null, 2),
        autoScroll: provider.autoScroll,
      });
      logger.appendLine(`ERROR: ${err}`);
      throw err;
    }

    let accumulatedText = "";
    let stepChunks: string[] = [];

    // Process streaming response - collect all text first
    try {
      for await (const fragment of chatResponse.text) {
        accumulatedText += fragment;
        stepChunks.push(fragment);
      }
    } catch (err) {
      provider.sendMessage({
        type: "addError",
        value: JSON.stringify(err, null, 2),
        autoScroll: provider.autoScroll,
      });
      logger.appendLine(`ERROR: ${err}`);
      throw err;
    }

    // Check for tool calls in the accumulated text
    const parseResult = ToolCallParser.parseToolCalls(
      accumulatedText,
      15,
      false,
    );
    const toolCalls = parseResult.toolCalls;

    // If there are tool calls, only output text that comes before the first tool call
    if (toolCalls.length > 0) {
      const firstToolCallIndex = accumulatedText.indexOf("<tool_call>");
      if (firstToolCallIndex > 0) {
        const textBeforeToolCalls = accumulatedText
          .substring(0, firstToolCallIndex)
          .trim();
        if (textBeforeToolCalls) {
          updateResponse(textBeforeToolCalls);
          chunks.push(textBeforeToolCalls);
        }
      }
    } else {
      // No tool calls, output the full response
      updateResponse(accumulatedText);
      chunks.push(accumulatedText);
    }

    if (toolCalls.length === 0) {
      // No tool calls found, conversation is complete
      logger.appendLine(
        `INFO: No tool calls found in step ${currentStep}, ending loop`,
      );
      break;
    }

    // Execute tool calls and add results to conversation
    const toolResults: any[] = [];
    for (const toolCall of toolCalls) {
      toolCallCounter++; // Increment counter for each tool call

      // Create tool call UI (exactly like native tool calls)
      const toolCallHtml = createGitHubCopilotToolCallHtml(
        toolCall,
        toolCallCounter,
      );
      updateResponse(toolCallHtml);
      chunks.push(toolCallHtml);

      // Execute tool
      const result = await executePromptToolCall(toolCall, provider.toolSet!);
      toolResults.push(result);

      // Create tool result UI (exactly like native tool calls)
      const toolResultHtml = createGitHubCopilotToolResultHtml(
        result,
        toolCallCounter,
      );
      updateResponse(toolResultHtml);
      chunks.push(toolResultHtml);

      logger.appendLine(
        `INFO: Tool ${toolCall.toolName} executed with result: ${JSON.stringify(result.result)}`,
      );
    }

    // Add assistant response with tool calls to conversation history
    // Only include the text before tool calls, not the tool call syntax itself
    const firstToolCallIndex = accumulatedText.indexOf("<tool_call>");
    if (firstToolCallIndex > 0) {
      const textBeforeToolCalls = accumulatedText
        .substring(0, firstToolCallIndex)
        .trim();
      if (textBeforeToolCalls) {
        const assistantMessage: ModelMessage = {
          role: "assistant",
          content: textBeforeToolCalls,
        };
        conversationHistory.push(assistantMessage);
      }
    }

    // Add tool results as user messages (this is how AI SDK does it)
    for (const result of toolResults) {
      const toolResultMessage: ModelMessage = {
        role: "user",
        content: `Tool ${result.toolName} result: ${JSON.stringify(result.result)}`,
      };
      conversationHistory.push(toolResultMessage);
    }

    // Continue the loop for the next step
  }

  // Update provider's chat history with the final conversation
  provider.chatHistory = conversationHistory;
  return toolCallCounter;
}

/**
 * Execute standard GitHub Copilot chat without tools
 */
async function executeStandardGitHubCopilotChat(
  provider: ChatGptViewProvider,
  model: vscode.LanguageModelChat,
  systemPrompt: string,
  chunks: string[],
  reasonChunks: string[],
  toolCallCounter: number,
  updateResponse: (message: string) => void,
  updateReasoning?: (message: string, roundNumber?: number) => void,
): Promise<number> {
  // Prepare messages with system prompt
  const messagesWithSystem = [
    { role: "system" as const, content: systemPrompt },
    ...provider.chatHistory,
  ];
  const messages = convertToLMChatMessages(messagesWithSystem);

  let chatResponse: vscode.LanguageModelChatResponse;
  try {
    const cancellationTokenSource = new vscode.CancellationTokenSource();
    // If we have an abort controller, listen to it and cancel the token
    if (provider.abortController) {
      provider.abortController.signal.addEventListener("abort", () => {
        cancellationTokenSource.cancel();
      });
    }

    chatResponse = await model.sendRequest(
      messages,
      {},
      cancellationTokenSource.token,
    );
  } catch (err) {
    provider.sendMessage({
      type: "addError",
      value: JSON.stringify(err, null, 2),
      autoScroll: provider.autoScroll,
    });
    logger.appendLine(`ERROR: ${err}`);
    throw err;
  }

  try {
    for await (const fragment of chatResponse.text) {
      updateResponse(fragment);
      chunks.push(fragment);
    }
  } catch (err) {
    provider.sendMessage({
      type: "addError",
      value: JSON.stringify(err, null, 2),
      autoScroll: provider.autoScroll,
    });
    logger.appendLine(`ERROR: ${err}`);
    throw err;
  }

  // Add final assistant response to chat history
  const assistantResponse: ModelMessage = {
    role: "assistant",
    content: chunks.join(""),
  };
  provider.chatHistory.push(assistantResponse);

  return toolCallCounter;
}

function convertToLMChatMessages(
  messages: ModelMessage[],
): vscode.LanguageModelChatMessage[] {
  return messages.map((message) => {
    switch (message.role) {
      case "user":
        return vscode.LanguageModelChatMessage.User(message.content as string);
      case "assistant":
        return vscode.LanguageModelChatMessage.Assistant(
          message.content as string,
        );
      case "system":
        return vscode.LanguageModelChatMessage.User(message.content as string);
      case "tool":
        return vscode.LanguageModelChatMessage.User(
          JSON.stringify(message.content),
        );
      default:
        throw new Error(`Unknown role for ${JSON.stringify(message)}`);
    }
  });
}

/**
 * Create HTML for GitHub Copilot tool calls
 */
function createGitHubCopilotToolCallHtml(
  toolCall: any,
  toolCallCounter: number,
): string {
  const toolCallId = `github-copilot-tool-call-${Date.now()}-${toolCallCounter}`;
  const toolIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="tool-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>`;

  return `
<div class="tool-call-block" id="${toolCallId}" data-tool-name="${toolCall.toolName}" data-tool-counter="${toolCallCounter}">
  <div class="tool-call-header" onclick="toggleToolCall('${toolCallId}')">
    <svg class="tool-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M9 18l6-6-6-6"/>
    </svg>
    <div class="tool-info">
      ${toolIcon}
      <span class="tool-name">${toolCall.toolName}</span>
    </div>
    <span class="tool-status status-running">Running</span>
  </div>
  <div class="tool-call-content collapsed">
    <div class="tool-call-args">
      <div class="args-header">
        <span class="section-label">Arguments</span>
        <button class="copy-button" onclick="copyToolArgs(this, '${toolCallId}')">Copy</button>
      </div>
      <pre><code class="language-json">${JSON.stringify(toolCall.arguments, null, 2)}</code></pre>
    </div>
    <div class="tool-call-result">
      <div class="tool-loading">
        <div class="tool-loading-spinner"></div>
        <span>Waiting for result...</span>
      </div>
    </div>
  </div>
</div>`;
}

/**
 * Create HTML for GitHub Copilot tool results
 */
function createGitHubCopilotToolResultHtml(
  result: any,
  toolCallCounter: number,
): string {
  return `<tool-result data-tool-name="${result.toolName}" data-counter="${toolCallCounter}">
${JSON.stringify(result.result)}
</tool-result>`;
}
