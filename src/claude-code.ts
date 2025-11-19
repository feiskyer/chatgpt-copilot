/**
 *
 * @license
 * Copyright (c) 2024 - Present, Pengfei Ni
 *
 * All rights reserved. Code licensed under the ISC license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */

import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { ModelMessage } from "ai";
import * as fs from "fs";
import * as vscode from "vscode";
import ChatGptViewProvider from "./chatgpt-view-provider";
import { logger } from "./logger";
import { MCPServer } from "./mcp-server-provider";

/**
 * Converts enabled MCP servers to Claude Code SDK format
 */
function convertMCPServersForClaudeCode(
  enabledServers: MCPServer[],
): Record<string, any> {
  const claudeCodeMcpServers: Record<string, any> = {};

  for (const server of enabledServers) {
    const serverConfig: any = {};

    switch (server.type) {
      case "sse":
        serverConfig.type = "sse";
        serverConfig.url = server.url || "";
        if (server.headers && Object.keys(server.headers).length > 0) {
          serverConfig.headers = server.headers;
        }
        break;

      case "streamable-http":
        // Claude Code uses "http" for streamable-http
        serverConfig.type = "http";
        serverConfig.url = server.url || "";
        if (server.headers && Object.keys(server.headers).length > 0) {
          serverConfig.headers = server.headers;
        }
        break;

      case "stdio":
      default:
        // Default to stdio if type is not specified or is stdio
        serverConfig.type = "stdio";
        serverConfig.command = server.command || "";
        if (server.arguments && server.arguments.length > 0) {
          serverConfig.args = server.arguments;
        }
        if (server.env && Object.keys(server.env).length > 0) {
          serverConfig.env = server.env;
        }
        break;
    }

    claudeCodeMcpServers[server.name] = serverConfig;
  }

  if (Object.keys(claudeCodeMcpServers).length > 0) {
    logger.appendLine(
      `INFO: Converting ${Object.keys(claudeCodeMcpServers).length} enabled MCP servers for Claude Code: ${Object.keys(claudeCodeMcpServers).join(", ")}`,
    );
  }

  return claudeCodeMcpServers;
}

/**
 * Convert VSCode chat messages to a single prompt string for Claude Code SDK
 */
function convertMessagesToPrompt(messages: ModelMessage[]): string {
  // Claude Code SDK handles message history limits internally
  const messageStrings = messages.map((msg, index) => {
    const role = msg.role === "user" ? "User" : "Assistant";
    let content = "";

    // Handle different content types with better formatting
    if (typeof msg.content === "string") {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      const parts: string[] = [];

      for (const part of msg.content) {
        if (part.type === "text") {
          parts.push(part.text);
        } else if (part.type === "image") {
          // Note images in the conversation
          parts.push("[Image content provided]");
        } else if (
          (part as any).type === "tool-use" ||
          (part as any).type === "tool_use"
        ) {
          // Preserve tool use information
          parts.push(`[Tool: ${(part as any).name || "unknown"}]`);
        } else if (
          (part as any).type === "tool-result" ||
          (part as any).type === "tool_result"
        ) {
          // Preserve tool result information
          parts.push(`[Tool Result]`);
        }
      }

      content = parts.join("\n");
    }

    // Add conversation markers for clarity
    if (index === 0 && messages.length > 1) {
      return `=== Conversation History ===\n\n${role}: ${content}`;
    } else if (index === messages.length - 1 && messages.length > 1) {
      return `=== Current Message ===\n\n${role}: ${content}`;
    }

    return `${role}: ${content}`;
  });

  // Filter out empty messages and join with clear separators
  return messageStrings.filter((msg) => msg.trim() !== "").join("\n\n---\n\n");
}

/**
 * Validate Claude Code executable path
 */
function validateClaudeCodePath(claudePath: string | undefined): boolean {
  if (
    !claudePath ||
    claudePath.trim() === "" ||
    claudePath.trim() === "claude"
  ) {
    // Using default or no custom path
    return true;
  }

  try {
    // Check if the path exists and is executable
    if (fs.existsSync(claudePath)) {
      const stats = fs.statSync(claudePath);
      if (stats.isFile()) {
        // On Unix-like systems, check if executable
        if (process.platform !== "win32") {
          try {
            fs.accessSync(claudePath, fs.constants.X_OK);
          } catch {
            logger.appendLine(
              `WARN: Claude Code path exists but is not executable: ${claudePath}`,
            );
            return false;
          }
        }
        return true;
      }
    }
    logger.appendLine(`WARN: Claude Code path does not exist: ${claudePath}`);
    return false;
  } catch (error) {
    logger.appendLine(`WARN: Error validating Claude Code path: ${error}`);
    return false;
  }
}

/**
 * Validate MCP server configuration
 */
function validateMCPServerConfig(server: MCPServer): string | null {
  if (!server.name) {
    return "Server name is required";
  }

  switch (server.type) {
    case "stdio":
      if (!server.command) {
        return `Server ${server.name}: command is required for stdio type`;
      }
      break;
    case "sse":
    case "streamable-http":
      if (!server.url) {
        return `Server ${server.name}: URL is required for ${server.type} type`;
      }
      try {
        new URL(server.url);
      } catch {
        return `Server ${server.name}: Invalid URL format`;
      }
      break;
  }

  return null; // No validation errors
}

/**
 * Chat with Claude Code SDK
 */
export async function chatClaudeCode(
  provider: ChatGptViewProvider,
  question: string,
  images: Record<string, string>,
  startResponse: () => void,
  updateResponse: (message: string) => void,
  updateReasoning?: (message: string, roundNumber?: number) => void,
) {
  logger.appendLine(
    `INFO: Claude Code SDK - Model: ${provider.model}, Question: ${question.trim()}`,
  );

  // Validate Claude Code path if provided
  if (
    provider.claudeCodePath &&
    !validateClaudeCodePath(provider.claudeCodePath)
  ) {
    const errorMsg = `Invalid Claude Code path: ${provider.claudeCodePath}. Please check your settings.`;
    logger.appendLine(`ERROR: ${errorMsg}`);
    provider.sendMessage({
      type: "addError",
      value: errorMsg,
      autoScroll: provider.autoScroll,
    });
    return;
  }

  // Validate MCP servers
  for (const server of provider.modelConfig.enabledMCPServers) {
    const validationError = validateMCPServerConfig(server);
    if (validationError) {
      logger.appendLine(
        `ERROR: MCP Server validation failed: ${validationError}`,
      );
      provider.sendMessage({
        type: "addError",
        value: `MCP Server configuration error: ${validationError}`,
        autoScroll: provider.autoScroll,
      });
      return;
    }
  }

  // Prepare the message
  const chatMessage: ModelMessage = {
    role: "user",
    content: question,
  };

  // Handle images by including them in the prompt with clear instructions
  if (Object.keys(images).length > 0) {
    const imageDescriptions: string[] = [];
    for (const [title, base64Content] of Object.entries(images)) {
      // Claude Code can't directly process base64 images, but we can:
      // 1. Describe them in the prompt
      // 2. Suggest saving them temporarily if needed
      imageDescriptions.push(`[Image: ${title}]`);
      logger.appendLine(
        `INFO: Image provided: ${title}. Note: Claude Code SDK requires images to be saved as files for processing.`,
      );
    }

    // Append image context to the question
    if (imageDescriptions.length > 0) {
      question = `${question}\n\nContext: The user has provided the following images: ${imageDescriptions.join(", ")}. Note: These images would need to be saved as files for Claude Code to process them using the Read tool.`;
    }
  }

  // Start the response
  startResponse();

  const chunks: string[] = [];
  const reasonChunks: string[] = [];
  let toolCallCounter = 0;
  const toolCallMap = new Map<string, number>(); // Map tool use IDs to counter numbers
  const toolNameMap = new Map<string, string>(); // Map tool use IDs to tool names

  // Add message to history
  provider.chatHistory.push(chatMessage);

  // Convert chat history to prompt
  const prompt = convertMessagesToPrompt(provider.chatHistory);

  // Get workspace folder path
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : process.cwd();

  // Convert MCP servers
  const mcpServers = convertMCPServersForClaudeCode(
    provider.modelConfig.enabledMCPServers,
  );

  // Validate and prepare session resumption
  let shouldResume = false;
  if (provider.claudeCodeSessionId) {
    shouldResume = true;
    logger.appendLine(
      `INFO: Attempting to resume Claude Code session: ${provider.claudeCodeSessionId}`,
    );
  }

  // Prepare options for Claude Code SDK
  const options: Options = {
    model: provider.model || "sonnet",
    cwd: cwd,
    maxTurns: provider.maxSteps,
    permissionMode: "bypassPermissions", // Allow all tools without prompting
    mcpServers:
      Object.keys(mcpServers).length > 0 ? (mcpServers as any) : undefined,
    abortController: provider.abortController || undefined,
    // Resume from previous session if valid
    ...(shouldResume &&
      provider.claudeCodeSessionId && {
        resume: provider.claudeCodeSessionId,
      }),
    // The SDK will automatically find cli.js in its own directory if pathToClaudeCodeExecutable is not provided
    // Only set it if explicitly provided by the user
    ...(provider.claudeCodePath &&
      provider.claudeCodePath.trim() !== "" &&
      provider.claudeCodePath.trim() !== "claude" && {
        pathToClaudeCodeExecutable: provider.claudeCodePath,
      }),
    ...(provider.modelConfig.systemPrompt && {
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: provider.modelConfig.systemPrompt,
      },
    }),
  };

  try {
    logger.appendLine(
      `INFO: Executing Claude Code query with options: model=${options.model}, cwd=${options.cwd}, maxTurns=${options.maxTurns}, resume=${options.resume || "new session"}`,
    );

    // Execute the query
    const response = query({
      prompt: prompt,
      options: options,
    });

    // Process the streaming response
    for await (const message of response) {
      // Handle different message types
      switch (message.type) {
        case "assistant": {
          // Process assistant messages
          if (message.message && message.message.content) {
            for (const block of message.message.content) {
              if (block.type === "text" && block.text) {
                // Stream text content
                updateResponse(block.text);
                chunks.push(block.text);
              } else if (block.type === "tool_use") {
                // Handle tool calls - increment counter and store mapping
                toolCallCounter++;
                if (block.id) {
                  toolCallMap.set(block.id, toolCallCounter);
                  toolNameMap.set(block.id, block.name);
                }

                logger.appendLine(
                  `INFO: Tool call #${toolCallCounter} - ${block.name} with args: ${JSON.stringify(block.input)}`,
                );

                // Format the tool call display following OpenAI pattern
                const toolCallHtml = formatToolCallHTML(
                  block.name,
                  block.input,
                  toolCallCounter,
                );

                updateResponse(toolCallHtml);
                chunks.push(toolCallHtml);
              }
            }
          }
          break;
        }

        case "user": {
          // Handle tool results
          if (message.message && message.message.content) {
            for (const block of message.message.content) {
              if (block.type === "tool_result") {
                // Get the counter and tool name from the tool use ID
                const counter = block.tool_use_id
                  ? toolCallMap.get(block.tool_use_id)
                  : toolCallCounter;
                const toolName = block.tool_use_id
                  ? toolNameMap.get(block.tool_use_id)
                  : "unknown";

                logger.appendLine(
                  `INFO: Tool result #${counter} for ${toolName} - Result: ${JSON.stringify(block.content)}`,
                );

                // Format tool result as marker for frontend processing
                const resultMarker = formatToolResultMarker(
                  toolName || "unknown",
                  block.content,
                  counter || toolCallCounter,
                );

                updateResponse(resultMarker);
                chunks.push(resultMarker);
              }
            }
          }
          break;
        }

        case "result": {
          // Capture session ID from result message as well
          if (message.session_id) {
            provider.claudeCodeSessionId = message.session_id;
          }
          // Handle completion
          if (message.subtype === "success") {
            logger.appendLine(
              `INFO: Claude Code completed successfully. Session: ${message.session_id}, Cost: $${message.total_cost_usd}, Duration: ${message.duration_ms}ms`,
            );
          } else if (message.subtype === "error_max_turns") {
            logger.appendLine(
              `WARN: Claude Code reached max turns limit (${provider.maxSteps}). Session: ${message.session_id}`,
            );
            updateResponse(
              `\n\n⚠️ Reached maximum turns limit (${provider.maxSteps}). The task may be incomplete.`,
            );
          } else if (message.subtype === "error_during_execution") {
            logger.appendLine(
              `ERROR: Claude Code execution error. Session: ${message.session_id}`,
            );
            updateResponse(`\n\n❌ An error occurred during execution.`);
          }
          break;
        }

        case "system": {
          if (message.subtype === "init") {
            // Capture and store the session ID for future use
            if (message.session_id) {
              provider.claudeCodeSessionId = message.session_id;
              logger.appendLine(
                `INFO: Claude Code session initialized with ID: ${message.session_id}`,
              );
            }
            logger.appendLine(
              `INFO: Claude Code session initialized. Model: ${message.model}, Tools: ${message.tools?.join(", ")}`,
            );
            if (message.mcp_servers && message.mcp_servers.length > 0) {
              logger.appendLine(
                `INFO: MCP servers connected: ${message.mcp_servers.map((s) => s.name).join(", ")}`,
              );
            }
          }
          break;
        }

        default: {
          logger.appendLine(
            `DEBUG: Unhandled message type: ${(message as any).type}`,
          );
        }
      }
    }

    // Save the final response
    provider.response = chunks.join("");
    if (reasonChunks.length > 0) {
      provider.reasoning = reasonChunks.join("");
    }

    // Save the assistant response to chat history for context continuity
    const assistantMessage: ModelMessage = {
      role: "assistant",
      content: provider.response,
    };
    provider.chatHistory.push(assistantMessage);

    logger.appendLine(
      `INFO: Claude Code SDK completed. Response length: ${provider.response.length}`,
    );
  } catch (error: any) {
    // Check if this is a user abort - handle gracefully without stack trace
    if (
      error.message?.includes("aborted") ||
      error.message?.includes("abort") ||
      error.name === "AbortError"
    ) {
      logger.appendLine(`INFO: Claude Code request cancelled by user`);
      // Don't show error to user for expected aborts
      return;
    }

    logger.appendLine(`ERROR: Claude Code SDK error: ${error.message}`);
    logger.appendLine(`ERROR: Stack trace: ${error.stack}`);

    // Check for specific error types and provide actionable guidance
    let errorMessage = `Claude Code error: ${error.message}`;

    if (
      error.message?.includes("not logged in") ||
      error.message?.includes("authentication") ||
      error.message?.includes("ANTHROPIC_API_KEY")
    ) {
      errorMessage = `🔐 Claude Code Authentication Error

Please resolve this by one of the following methods:

1. **Set API Key (Recommended):**
   • Run: export ANTHROPIC_API_KEY="your-api-key"
   • Or add to your shell profile (~/.bashrc, ~/.zshrc, etc.)

2. **Use Claude CLI Login:**
   • Run: claude login
   • Follow the browser authentication flow

3. **Check VS Code Terminal:**
   • Restart VS Code after setting environment variables
   • Ensure the terminal inherits your environment

Error details: ${error.message}`;
    } else if (
      error.message?.includes("executable not found") ||
      error.message?.includes("spawn") ||
      error.message?.includes("ENOENT")
    ) {
      errorMessage = `📦 Claude Code Not Found

To fix this issue:

1. **Install Claude Code globally:**
   npm install -g @anthropic-ai/claude-code

2. **Or use local installation:**
   • Install: npm install @anthropic-ai/claude-code
   • Set path in settings: "chatgpt.gpt3.claudeCodePath"
   • Point to: node_modules/.bin/claude

3. **Verify installation:**
   • Run: which claude (Mac/Linux) or where claude (Windows)
   • Ensure the path is in your system PATH

Error details: ${error.message}`;
    } else if (error.message?.includes("timeout")) {
      errorMessage = `⏱️ Claude Code Request Timeout

The operation took too long. Try:
• Breaking down your request into smaller tasks
• Checking your internet connection
• Reducing the max turns limit in settings

Error details: ${error.message}`;
    } else if (error.message?.includes("rate limit")) {
      errorMessage = `⚠️ API Rate Limit Exceeded

You've hit the Claude API rate limit. Please:
• Wait 1-2 minutes before retrying
• Consider upgrading your API plan for higher limits
• Reduce the frequency of requests

Error details: ${error.message}`;
    } else if (error.message?.includes("session")) {
      errorMessage = `🔄 Session Error

There was an issue with your Claude Code session:
• The session may have expired or become invalid
• Try starting a new conversation
• Clear the conversation history if the issue persists

Error details: ${error.message}`;
    }

    provider.sendMessage({
      type: "addError",
      value: errorMessage,
      autoScroll: provider.autoScroll,
    });
  }
}

/**
 * Format tool call as HTML for display (following OpenAI pattern exactly)
 */
function formatToolCallHTML(
  toolName: string,
  toolInput: any,
  counter: number,
): string {
  const formattedArgs = typeof toolInput === "string" ? toolInput : toolInput;

  const toolCallId = `tool-call-${Date.now()}-${counter}`;

  const toolIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="tool-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
</svg>`;

  // Use template literal for better formatting, matching OpenAI provider exactly
  const toolCallHtml = `
<div class="tool-call-block" id="${toolCallId}" data-tool-name="${toolName}" data-tool-counter="${counter}">
  <div class="tool-call-header" onclick="toggleToolCall('${toolCallId}')">
    <svg class="tool-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M9 18l6-6-6-6"/>
    </svg>
    <div class="tool-info">
      ${toolIcon}
      <span class="tool-name">${toolName}</span>
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

  return toolCallHtml;
}

/**
 * Format tool result marker for frontend processing (following OpenAI pattern exactly)
 */
function formatToolResultMarker(
  toolName: string,
  result: any,
  counter: number,
): string {
  // Simplify result formatting
  let formattedResult: string;

  if (Array.isArray(result)) {
    // Handle array of content blocks from Claude Code SDK
    const textParts: string[] = [];
    for (const item of result) {
      if (typeof item === "string") {
        textParts.push(item);
      } else if (item?.type === "text" && item?.text) {
        textParts.push(item.text);
      } else if (item?.type === "image") {
        textParts.push("[Image content]");
      } else {
        textParts.push(JSON.stringify(item));
      }
    }
    formattedResult = textParts.join("\n");
  } else if (typeof result === "string") {
    formattedResult = result;
  } else {
    formattedResult = JSON.stringify(result, null, 2);
  }

  // Return a tool-result marker that matches OpenAI format exactly
  return `<tool-result data-tool-name="${toolName}" data-counter="${counter}">
${typeof formattedResult === "string" ? formattedResult : JSON.stringify(formattedResult, null, 2)}
</tool-result>`;
}
