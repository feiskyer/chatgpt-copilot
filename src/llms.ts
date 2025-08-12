/* eslint-disable eqeqeq */

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
import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import { createPerplexity } from "@ai-sdk/perplexity";
import { createReplicate } from "@ai-sdk/replicate";
import { createTogetherAI } from "@ai-sdk/togetherai";
import { createXai } from "@ai-sdk/xai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createAzure } from "@quail-ai/azure-ai-provider";
import { extractReasoningMiddleware, wrapLanguageModel } from "ai";
import { createOllama } from "ollama-ai-provider";
import * as vscode from "vscode";
import ChatGptViewProvider from "./chatgpt-view-provider";
import { createClaudeCode } from "./claudecode";
import { logger } from "./logger";
import { MCPServer } from "./mcp-server-provider";
import { ModelConfig } from "./model-config";
import { isReasoningModel } from "./types";
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");

/**
 * Converts enabled MCP servers to Claude Code format
 * @param enabledServers Array of enabled MCP servers
 * @returns A Record of MCP server configurations for Claude Code
 */
async function convertMCPServersForClaudeCode(
  enabledServers: MCPServer[],
): Promise<Record<string, any>> {
  const claudeCodeMcpServers: Record<string, any> = {};

  for (const server of enabledServers) {
    const serverConfig: any = {};

    switch (server.type) {
      case "stdio":
        serverConfig.type = "stdio";
        serverConfig.command = server.command || "";
        if (server.arguments && server.arguments.length > 0) {
          serverConfig.args = server.arguments;
        }
        if (server.env && Object.keys(server.env).length > 0) {
          serverConfig.env = server.env;
        }
        break;

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

      default:
        // Default to stdio if type is not specified
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

// initClaudeCodeModel initializes the Claude Code model with the given parameters.
export async function initClaudeCodeModel(
  viewProvider: ChatGptViewProvider,
  config: ModelConfig,
) {
  // Get the workspace folder path, fallback to process.cwd() if no workspace is open
  logger.appendLine(`Initializing Claude Code model...`);
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : process.cwd();
  const claudeCodePath = await resolveExecutablePath(config.claudeCodePath);

  // Convert enabled MCP servers to Claude Code format
  const mcpServers = await convertMCPServersForClaudeCode(
    config.enabledMCPServers,
  );

  const claudeCode = createClaudeCode({
    defaultSettings: {
      pathToClaudeCodeExecutable: claudeCodePath,
      permissionMode: "bypassPermissions",
      maxTurns: viewProvider.maxSteps,
      cwd: cwd,
      verbose: true,
      logger: {
        warn: (message: string) =>
          logger.appendLine(`[WARN] Claude Code: ${message}`),
        error: (message: string) =>
          logger.appendLine(`[ERROR] Claude Code: ${message}`),
      },
      mcpServers: mcpServers,
    },
  });

  const model = viewProvider.model ? viewProvider.model : "sonnet";
  viewProvider.apiChat = claudeCode(model);
}

// initClaudeModel initializes the Claude model with the given parameters.
export async function initClaudeModel(
  viewProvider: ChatGptViewProvider,
  config: ModelConfig,
) {
  let apiBaseUrl = config.apiBaseUrl;
  if (!apiBaseUrl || apiBaseUrl == "https://api.openai.com/v1") {
    apiBaseUrl = "https://api.anthropic.com/v1";
  }

  const ai = createAnthropic({
    baseURL: apiBaseUrl,
    apiKey: config.apiKey,
  });
  if (config.isReasoning) {
    viewProvider.apiReasoning = wrapLanguageModel({
      model: ai.languageModel(
        viewProvider.reasoningModel
          ? viewProvider.reasoningModel
          : "claude-3-5-sonnet-20240620",
      ),
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    });
  } else {
    viewProvider.apiChat = ai.languageModel(
      viewProvider.model ? viewProvider.model : "claude-3-5-sonnet-20240620",
    ) as any;
  }
}

// initGeminiModel initializes the Gemini model with the given parameters.
export async function initGeminiModel(
  viewProvider: ChatGptViewProvider,
  config: ModelConfig,
) {
  let apiBaseUrl = config.apiBaseUrl;
  if (!apiBaseUrl || apiBaseUrl == "https://api.openai.com/v1") {
    apiBaseUrl = "https://generativelanguage.googleapis.com/v1beta";
  }

  let ai = createGoogleGenerativeAI({
    baseURL: apiBaseUrl,
    apiKey: config.apiKey,
  });

  if (config.isReasoning) {
    const model = viewProvider.reasoningModel
      ? viewProvider.reasoningModel
      : "gemini-2.5-pro";
    viewProvider.apiReasoning = wrapLanguageModel({
      model: ai(model),
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    });

    if (config.searchGrounding) {
      viewProvider.apiReasoning = wrapLanguageModel({
        model: ai(model),
        middleware: extractReasoningMiddleware({ tagName: "think" }),
      });
    }
  } else {
    const model = viewProvider.model ? viewProvider.model : "gemini-2.5-pro";
    viewProvider.apiChat = ai(model);
    if (config.searchGrounding) {
      viewProvider.apiChat = ai(model);
    }
  }
}

export async function initOllamaModel(
  viewProvider: ChatGptViewProvider,
  config: ModelConfig,
) {
  let apiBaseUrl = config.apiBaseUrl;
  if (!apiBaseUrl || apiBaseUrl == "https://api.openai.com/v1") {
    apiBaseUrl = "http://localhost:11434/api";
  }

  const ai = createOllama({
    baseURL: apiBaseUrl,
  });

  if (config.isReasoning) {
    const model = viewProvider.reasoningModel
      ? viewProvider.reasoningModel
      : "deepseek-r1";
    viewProvider.apiReasoning = wrapLanguageModel({
      model: ai.languageModel(model) as any,
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    });
  } else {
    const model = viewProvider.model ? viewProvider.model : "deepseek-r1";
    if (isReasoningModel(model)) {
      viewProvider.apiChat = wrapLanguageModel({
        model: ai.languageModel(model) as any,
        middleware: extractReasoningMiddleware({ tagName: "think" }),
      });
    } else {
      viewProvider.apiChat = ai.languageModel(model) as any;
    }
  }
}

export async function initMistralModel(
  viewProvider: ChatGptViewProvider,
  config: ModelConfig,
) {
  let apiBaseUrl = config.apiBaseUrl;
  if (!apiBaseUrl || apiBaseUrl == "https://api.openai.com/v1") {
    apiBaseUrl = "https://api.mistral.ai/v1";
  }

  const ai = createMistral({
    baseURL: apiBaseUrl,
    apiKey: config.apiKey,
  });

  if (config.isReasoning) {
    viewProvider.apiReasoning = wrapLanguageModel({
      model: ai.languageModel(
        viewProvider.reasoningModel
          ? viewProvider.reasoningModel
          : "deepseek-r1",
      ),
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    });
  } else {
    viewProvider.apiChat = ai.languageModel(
      viewProvider.model ? viewProvider.model : "deepseek-r1",
    ) as any;
  }
}

export async function initXAIModel(
  viewProvider: ChatGptViewProvider,
  config: ModelConfig,
) {
  let apiBaseUrl = config.apiBaseUrl;
  if (!apiBaseUrl || apiBaseUrl == "https://api.openai.com/v1") {
    apiBaseUrl = "https://api.x.ai/v1";
  }

  // Ensure the base URL includes the /v1 path component
  if (
    apiBaseUrl &&
    !apiBaseUrl.endsWith("/v1") &&
    !apiBaseUrl.includes("/v1/")
  ) {
    apiBaseUrl = `${apiBaseUrl}/v1`;
  }

  const ai = createXai({
    baseURL: apiBaseUrl,
    apiKey: config.apiKey,
  });
  if (config.isReasoning) {
    viewProvider.apiReasoning = wrapLanguageModel({
      model: ai.languageModel(
        viewProvider.reasoningModel ? viewProvider.reasoningModel : "grok-beta",
      ),
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    });
  } else {
    viewProvider.apiChat = ai.languageModel(
      viewProvider.model ? viewProvider.model : "grok-beta",
    ) as any;
  }
}

export async function initTogetherModel(
  viewProvider: ChatGptViewProvider,
  config: ModelConfig,
) {
  let apiBaseUrl = config.apiBaseUrl;
  if (!apiBaseUrl || apiBaseUrl == "https://api.openai.com/v1") {
    apiBaseUrl = "https://api.together.xyz/v1";
  }

  const ai = createTogetherAI({
    apiKey: config.apiKey,
    baseURL: apiBaseUrl,
  });

  if (config.isReasoning) {
    const model = viewProvider.reasoningModel
      ? viewProvider.reasoningModel
      : "deepseek-ai/DeepSeek-R1";

    viewProvider.apiReasoning = wrapLanguageModel({
      model: ai.languageModel(model) as any,
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    });
  } else {
    const model = viewProvider.model
      ? viewProvider.model
      : "deepseek-ai/DeepSeek-R1";

    if (isReasoningModel(model)) {
      viewProvider.apiChat = wrapLanguageModel({
        model: ai.languageModel(model) as any,
        middleware: extractReasoningMiddleware({ tagName: "think" }),
      });
    } else {
      viewProvider.apiChat = ai.languageModel(model) as any;
    }
  }
}

export async function initDeepSeekModel(
  viewProvider: ChatGptViewProvider,
  config: ModelConfig,
) {
  let apiBaseUrl = config.apiBaseUrl;
  if (!apiBaseUrl || apiBaseUrl == "https://api.openai.com/v1") {
    apiBaseUrl = "https://api.deepseek.com/v1";
  }

  const ai = createDeepSeek({
    apiKey: config.apiKey,
    baseURL: apiBaseUrl,
  });

  if (config.isReasoning) {
    const model = viewProvider.reasoningModel
      ? viewProvider.reasoningModel
      : "deepseek-chat";

    viewProvider.apiReasoning = wrapLanguageModel({
      model: ai.languageModel(model) as any,
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    });
  } else {
    const model = viewProvider.model ? viewProvider.model : "deepseek-chat";

    if (isReasoningModel(model)) {
      viewProvider.apiChat = wrapLanguageModel({
        model: ai.languageModel(model) as any,
        middleware: extractReasoningMiddleware({ tagName: "think" }),
      });
    } else {
      viewProvider.apiChat = ai.languageModel(model) as any;
    }
  }
}

export async function initGroqModel(
  viewProvider: ChatGptViewProvider,
  config: ModelConfig,
) {
  let apiBaseUrl = config.apiBaseUrl;
  if (!apiBaseUrl || apiBaseUrl == "https://api.openai.com/v1") {
    apiBaseUrl = "https://api.groq.com/openai/v1";
  }

  const ai = createGroq({
    apiKey: config.apiKey,
    baseURL: apiBaseUrl,
  });

  if (config.isReasoning) {
    const model = viewProvider.reasoningModel
      ? viewProvider.reasoningModel
      : "gemma2-9b-it";

    viewProvider.apiReasoning = wrapLanguageModel({
      model: ai.languageModel(model) as any,
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    });
  } else {
    const model = viewProvider.model ? viewProvider.model : "gemma2-9b-it";
    if (isReasoningModel(model)) {
      viewProvider.apiChat = wrapLanguageModel({
        model: ai.languageModel(model) as any,
        middleware: extractReasoningMiddleware({ tagName: "think" }),
      });
    } else {
      viewProvider.apiChat = ai.languageModel(model) as any;
    }
  }
}

export async function initPerplexityModel(
  viewProvider: ChatGptViewProvider,
  config: ModelConfig,
) {
  let apiBaseUrl = config.apiBaseUrl;
  if (!apiBaseUrl || apiBaseUrl == "https://api.openai.com/v1") {
    apiBaseUrl = "https://api.perplexity.ai";
  }

  const ai = createPerplexity({
    apiKey: config.apiKey,
    baseURL: apiBaseUrl,
  });

  viewProvider.apiChat = ai.languageModel(
    viewProvider.model ? viewProvider.model : "sonar-pro",
  ) as any;
}

export async function initOpenRouterModel(
  viewProvider: ChatGptViewProvider,
  config: ModelConfig,
) {
  const ai = createOpenRouter({
    apiKey: config.apiKey,
  });

  if (config.isReasoning) {
    const model = viewProvider.reasoningModel
      ? viewProvider.reasoningModel
      : "anthropic/claude-3.5-sonnet";

    viewProvider.apiReasoning = wrapLanguageModel({
      model: ai.languageModel(model) as any,
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    });
  } else {
    const model = viewProvider.model
      ? viewProvider.model
      : "anthropic/claude-3.5-sonnet";

    if (isReasoningModel(model)) {
      viewProvider.apiChat = wrapLanguageModel({
        model: ai.languageModel(model) as any,
        middleware: extractReasoningMiddleware({ tagName: "think" }),
      });
    } else {
      viewProvider.apiChat = ai.languageModel(model) as any;
    }
  }
}

export async function initAzureAIModel(
  viewProvider: ChatGptViewProvider,
  config: ModelConfig,
) {
  const azureAPIVersion = "2025-04-01-preview";
  let apiBaseUrl = config.apiBaseUrl;

  const ai = createAzure({
    apiKey: config.apiKey,
    endpoint: apiBaseUrl,
    // apiVersion: azureAPIVersion,
  });

  if (config.isReasoning) {
    const model = viewProvider.reasoningModel
      ? viewProvider.reasoningModel
      : "DeepSeek-R1";

    viewProvider.apiReasoning = wrapLanguageModel({
      model: ai.languageModel(model) as any,
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    });
  } else {
    const model = viewProvider.model ? viewProvider.model : "DeepSeek-R1";
    if (isReasoningModel(model)) {
      viewProvider.apiChat = wrapLanguageModel({
        model: ai.languageModel(model) as any,
        middleware: extractReasoningMiddleware({ tagName: "think" }),
      });
    } else {
      viewProvider.apiChat = ai.languageModel(model) as any;
    }
  }
}

// TODO: pending https://github.com/vercel/ai/issues/4918 to support language model.
export async function initReplicateModel(
  viewProvider: ChatGptViewProvider,
  config: ModelConfig,
) {
  let apiBaseUrl = config.apiBaseUrl;
  if (!apiBaseUrl || apiBaseUrl == "https://api.openai.com/v1") {
    apiBaseUrl = "https://api.replicate.com/v1";
  }

  const ai = createReplicate({
    apiToken: config.apiKey,
    baseURL: apiBaseUrl,
  });

  if (config.isReasoning) {
    const model = viewProvider.reasoningModel
      ? viewProvider.reasoningModel
      : "deepseek-ai/deepseek-r1";

    viewProvider.apiReasoning = wrapLanguageModel({
      model: ai.languageModel(model) as any,
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    });
  } else {
    const model = viewProvider.model
      ? viewProvider.model
      : "deepseek-ai/deepseek-r1";
    if (isReasoningModel(model)) {
      viewProvider.apiChat = wrapLanguageModel({
        model: ai.languageModel(model) as any,
        middleware: extractReasoningMiddleware({ tagName: "think" }),
      });
    } else {
      viewProvider.apiChat = ai.languageModel(model) as any;
    }
  }
}
/**
 * Resolves an executable path by checking if it exists and is executable.
 * If the path is not absolute, attempts to find it in the system PATH.
 *
 * @param executablePath The path to the executable
 * @returns The resolved executable path or the original path if not found
 */
async function resolveExecutablePath(executablePath: string): Promise<string> {
  const access = promisify(fs.access);

  // If path is empty or a placeholder, return as is
  if (!executablePath) {
    return executablePath;
  }

  // If it's an absolute path, check if it exists and is executable
  if (path.isAbsolute(executablePath)) {
    try {
      await access(executablePath, fs.constants.X_OK);
      return executablePath;
    } catch (error) {
      // Path doesn't exist or isn't executable
      return executablePath;
    }
  }

  // For non-absolute paths, try to find in PATH
  const envPath = process.env.PATH || "";
  const pathSeparator = process.platform === "win32" ? ";" : ":";
  const pathDirs = envPath.split(pathSeparator);

  for (const dir of pathDirs) {
    const fullPath = path.join(dir, executablePath);
    try {
      await access(fullPath, fs.constants.X_OK);
      return fullPath;
    } catch {
      // Continue to next directory
    }
  }

  // If not found, return the original path
  return executablePath;
}
