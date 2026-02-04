/* eslint-disable eqeqeq */

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
import {
  extractReasoningMiddleware,
  LanguageModel,
  wrapLanguageModel,
} from "ai";
import { createOllama } from "ollama-ai-provider-v2";
import * as vscode from "vscode";
import ChatGptViewProvider from "./chatgpt-view-provider";
import { logger } from "./logger";
import { ModelConfig } from "./model-config";
import { isReasoningModel } from "./types";

function wrapReasoningModelIfV3(model: unknown): LanguageModel {
  if (
    typeof model === "object" &&
    model !== null &&
    "specificationVersion" in model &&
    (model as { specificationVersion?: string }).specificationVersion === "v3"
  ) {
    return wrapLanguageModel({
      model: model as any,
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    });
  }

  return model as LanguageModel;
}

// initClaudeCodeModel initializes the Claude Code model with the given parameters.
export async function initClaudeCodeModel(
  viewProvider: ChatGptViewProvider,
  config: ModelConfig,
) {
  // Claude Code SDK doesn't use the traditional AI SDK model interface
  logger.appendLine(`Initializing Claude Code SDK model...`);

  // Store the model config for later use in the chat function
  viewProvider.modelConfig = config;

  // Store the Claude Code executable path if provided
  if (config.claudeCodePath) {
    viewProvider.claudeCodePath = config.claudeCodePath;
    logger.appendLine(`Claude Code path: ${config.claudeCodePath}`);
  }

  // Store the model name for Claude Code SDK
  if (!viewProvider.model) {
    viewProvider.model = "sonnet";
  }

  logger.appendLine(
    `Claude Code SDK initialized with model: ${viewProvider.model}`,
  );
}

// initGeminiCliModel initializes the Gemini CLI model with the given parameters.
export async function initGeminiCliModel(
  viewProvider: ChatGptViewProvider,
  config: ModelConfig,
) {
  const { createGeminiProvider } = await import("ai-sdk-provider-gemini-cli");
  const gemini = createGeminiProvider({
    authType: "oauth-personal",
  });

  const model = viewProvider.model ? viewProvider.model : "gemini-2.5-pro";
  viewProvider.apiChat = gemini(model);
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
  viewProvider.apiChat = ai.languageModel(
    viewProvider.model ? viewProvider.model : "claude-3-5-sonnet-20240620",
  );
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

  const model = viewProvider.model ? viewProvider.model : "gemini-2.5-pro";
  viewProvider.apiChat = ai(model);
  if (config.searchGrounding) {
    viewProvider.apiChat = ai(model);
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

  const model = viewProvider.model ? viewProvider.model : "deepseek-r1";
  if (isReasoningModel(model)) {
    viewProvider.apiChat = wrapLanguageModel({
      model: ai.languageModel(model),
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    });
  } else {
    viewProvider.apiChat = ai.languageModel(model);
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

  viewProvider.apiChat = ai.languageModel(
    viewProvider.model ? viewProvider.model : "deepseek-r1",
  );
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
  viewProvider.apiChat = ai.languageModel(
    viewProvider.model ? viewProvider.model : "grok-beta",
  );
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

  const model = viewProvider.model
    ? viewProvider.model
    : "deepseek-ai/DeepSeek-R1";

  if (isReasoningModel(model)) {
    viewProvider.apiChat = wrapLanguageModel({
      model: ai.languageModel(model),
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    });
  } else {
    viewProvider.apiChat = ai.languageModel(model);
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

  const model = viewProvider.model ? viewProvider.model : "deepseek-chat";

  if (isReasoningModel(model)) {
    viewProvider.apiChat = wrapLanguageModel({
      model: ai.languageModel(model),
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    });
  } else {
    viewProvider.apiChat = ai.languageModel(model);
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

  const model = viewProvider.model ? viewProvider.model : "gemma2-9b-it";
  if (isReasoningModel(model)) {
    viewProvider.apiChat = wrapLanguageModel({
      model: ai.languageModel(model),
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    });
  } else {
    viewProvider.apiChat = ai.languageModel(model);
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
  );
}

export async function initOpenRouterModel(
  viewProvider: ChatGptViewProvider,
  config: ModelConfig,
) {
  const ai = createOpenRouter({
    apiKey: config.apiKey,
  });

  const model = viewProvider.model
    ? viewProvider.model
    : "anthropic/claude-3.5-sonnet";

  if (isReasoningModel(model)) {
    viewProvider.apiChat = wrapLanguageModel({
      model: ai.languageModel(model),
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    });
  } else {
    viewProvider.apiChat = ai.languageModel(model);
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

  const model = viewProvider.model ? viewProvider.model : "DeepSeek-R1";
  if (isReasoningModel(model)) {
    viewProvider.apiChat = wrapReasoningModelIfV3(ai.languageModel(model));
  } else {
    viewProvider.apiChat = ai.languageModel(model);
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

  const model = viewProvider.model
    ? viewProvider.model
    : "deepseek-ai/deepseek-r1";
  if (isReasoningModel(model)) {
    viewProvider.apiChat = wrapLanguageModel({
      model: ai.languageModel(model),
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    });
  } else {
    viewProvider.apiChat = ai.languageModel(model);
  }
}

// OAuth Provider Init Functions

export async function initGeminiOAuthModel(
  viewProvider: ChatGptViewProvider,
  config: ModelConfig,
) {
  const { createGeminiOAuthProvider, hasValidToken, getModels } =
    await import("./oauth");

  let hasToken = await hasValidToken("gemini");
  if (!hasToken) {
    logger.appendLine("Gemini OAuth not authenticated. Triggering login...");
    await vscode.commands.executeCommand("chatgpt-copilot.oauth.login.gemini");
    hasToken = await hasValidToken("gemini");
    if (!hasToken) {
      throw new Error("Gemini OAuth authentication was cancelled or failed.");
    }
  }

  const oauthProvider = createGeminiOAuthProvider({
    sessionId: `gemini-${Date.now()}`,
  });

  const model = viewProvider.model || "gemini-2.5-pro";
  viewProvider.apiChat = await oauthProvider.getModel(model);

  const models = await getModels("gemini");
  logger.appendLine(`Gemini OAuth model initialized: ${viewProvider.model}`);
  logger.appendLine(
    `Supported Gemini models: ${models.map((m) => m.id).join(", ")}`,
  );
}

export async function initClaudeOAuthModel(
  viewProvider: ChatGptViewProvider,
  config: ModelConfig,
) {
  const { createClaudeOAuthProvider, hasValidToken, getModels } =
    await import("./oauth");

  let hasToken = await hasValidToken("claude");
  if (!hasToken) {
    logger.appendLine("Claude OAuth not authenticated. Triggering login...");
    await vscode.commands.executeCommand("chatgpt-copilot.oauth.login.claude");
    hasToken = await hasValidToken("claude");
    if (!hasToken) {
      throw new Error("Claude OAuth authentication was cancelled or failed.");
    }
  }

  const oauthProvider = createClaudeOAuthProvider({
    sessionId: `claude-${Date.now()}`,
  });

  const model = viewProvider.model || "claude-sonnet-4-20250514";
  viewProvider.apiChat = await oauthProvider.getModel(model);

  const models = await getModels("claude");
  logger.appendLine(`Claude OAuth model initialized: ${viewProvider.model}`);
  logger.appendLine(
    `Supported Claude models: ${models.map((m) => m.id).join(", ")}`,
  );
}

export async function initChatGPTOAuthModel(
  viewProvider: ChatGptViewProvider,
  config: ModelConfig,
) {
  const { createChatGPTOAuthProvider, hasValidToken, getModels } =
    await import("./oauth");

  let hasToken = await hasValidToken("chatgpt");
  if (!hasToken) {
    logger.appendLine("ChatGPT OAuth not authenticated. Triggering login...");
    await vscode.commands.executeCommand("chatgpt-copilot.oauth.login.chatgpt");
    hasToken = await hasValidToken("chatgpt");
    if (!hasToken) {
      throw new Error("ChatGPT OAuth authentication was cancelled or failed.");
    }
  }

  const oauthProvider = createChatGPTOAuthProvider({
    sessionId: `chatgpt-${Date.now()}`,
  });

  const model = viewProvider.model || "gpt-5.2-codex";
  viewProvider.apiChat = await oauthProvider.getModel(model);

  const models = await getModels("chatgpt");
  logger.appendLine(`ChatGPT OAuth model initialized: ${viewProvider.model}`);
  logger.appendLine(
    `Supported ChatGPT models: ${models.map((m) => m.id).join(", ")}`,
  );
}

export async function initAntigravityOAuthModel(
  viewProvider: ChatGptViewProvider,
  config: ModelConfig,
) {
  const { createAntigravityOAuthProvider, hasValidToken, getModels } =
    await import("./oauth");

  let hasToken = await hasValidToken("antigravity");
  if (!hasToken) {
    logger.appendLine(
      "Antigravity OAuth not authenticated. Triggering login...",
    );
    await vscode.commands.executeCommand(
      "chatgpt-copilot.oauth.login.antigravity",
    );
    hasToken = await hasValidToken("antigravity");
    if (!hasToken) {
      throw new Error(
        "Antigravity OAuth authentication was cancelled or failed.",
      );
    }
  }

  const oauthProvider = createAntigravityOAuthProvider({
    sessionId: `antigravity-${Date.now()}`,
  });

  const model = viewProvider.model || "gemini-3-pro-low";
  viewProvider.apiChat = await oauthProvider.getModel(model);

  const models = await getModels("antigravity");
  logger.appendLine(
    `Antigravity OAuth model initialized: ${viewProvider.model}`,
  );
  logger.appendLine(
    `Supported Antigravity models: ${models.map((m) => m.id).join(", ")}`,
  );
}
