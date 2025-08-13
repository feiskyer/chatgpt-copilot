/* eslint-disable eqeqeq */
/* eslint-disable @typescript-eslint/naming-convention */
/**
 *
 * @license
 * Copyright (c) 2022 - 2023, Ali Gençay
 * Copyright (c) 2024 - Present, Pengfei Ni
 *
 * All rights reserved. Code licensed under the ISC license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */

// @ts-ignore
import {
  OpenAIChatLanguageModel,
  OpenAICompletionLanguageModel,
} from "@ai-sdk/openai/internal";
import { LanguageModel as LanguageModelV2, ModelMessage } from "ai";
import delay from "delay";
import path from "path";
import * as vscode from "vscode";
import { chatClaudeCode } from "./claude-code";
import { reasoningChat } from "./deepclaude";
import { chatCopilot } from "./github-copilot";
import {
  initAzureAIModel,
  initClaudeCodeModel,
  initClaudeModel,
  initDeepSeekModel,
  initGeminiModel,
  initGroqModel,
  initMistralModel,
  initOllamaModel,
  initOpenRouterModel,
  initPerplexityModel,
  initReplicateModel,
  initTogetherModel,
  initXAIModel,
} from "./llms";
import { logger } from "./logger";
import { ToolSet, createToolSet } from "./mcp";
import { MCPServer } from "./mcp-server-provider";
import { ModelConfig } from "./model-config";
import { chatGpt, initGptModel } from "./openai";
import { chatCompletion, initGptLegacyModel } from "./openai-legacy";
import { PromptStore } from "./types";

// Temporary compatibility type to handle LanguageModelV1 and LanguageModelV2
type CompatibleLanguageModel =
  | LanguageModelV2
  | {
      specificationVersion: "v1";
      provider: string;
      modelId: string;
      doGenerate: any;
      doStream: any;
    };

export default class ChatGptViewProvider implements vscode.WebviewViewProvider {
  private webView?: vscode.WebviewView;

  public subscribeToResponse: boolean;
  public autoScroll: boolean;
  public provider: string = "Auto";
  public model?: string;
  public reasoningEffort: string = "high";
  public maxSteps: number = 0;
  private apiBaseUrl?: string;
  public modelConfig!: ModelConfig;
  public reasoningModel: string = "";
  public reasoningAPIBaseUrl: string = "";
  public reasoningProvider: string = "Auto";
  public reasoningModelConfig!: ModelConfig;
  public systemPromptOverride: string = "";
  public apiCompletion?:
    | OpenAICompletionLanguageModel
    | CompatibleLanguageModel;
  public apiChat?: OpenAIChatLanguageModel | CompatibleLanguageModel;
  public apiReasoning?: OpenAIChatLanguageModel | CompatibleLanguageModel;
  public conversationId?: string;
  public questionCounter: number = 0;
  public inProgress: boolean = false;
  public abortController?: AbortController;
  public currentMessageId: string = "";
  public reasoning: string = "";
  public response: string = "";
  public chatHistory: ModelMessage[] = [];
  public toolSet?: ToolSet;
  public reasoningRounds: Map<string, number> = new Map(); // Track reasoning rounds per message
  public contentSequence: number = 0; // Sequence counter for ordering content
  public claudeCodePath: string = "";
  public claudeCodeSessionId?: string;
  /**
   * Message to be rendered lazily if they haven't been rendered
   * in time before resolveWebviewView is called.
   */
  private leftOverMessage?: any;
  private conversationContext: {
    files: {
      [filepath: string]: {
        content: string;
        isAuto?: boolean;
        isImage?: boolean;
      };
    };
    filesSent: boolean;
  } = {
    files: {},
    filesSent: false,
  };

  constructor(private context: vscode.ExtensionContext) {
    this.subscribeToResponse =
      vscode.workspace
        .getConfiguration("chatgpt")
        .get("response.showNotification") || false;
    this.autoScroll = !!vscode.workspace
      .getConfiguration("chatgpt")
      .get("response.autoScroll");
    this.model = vscode.workspace
      .getConfiguration("chatgpt")
      .get("gpt3.model") as string;
    if (this.model == "custom") {
      this.model = vscode.workspace
        .getConfiguration("chatgpt")
        .get("gpt3.customModel") as string;
    }
    this.reasoningEffort = vscode.workspace
      .getConfiguration("chatgpt")
      .get("gpt3.reasoningEffort") as string;
    this.provider = vscode.workspace
      .getConfiguration("chatgpt")
      .get("gpt3.provider") as string;
    this.apiBaseUrl = vscode.workspace
      .getConfiguration("chatgpt")
      .get("gpt3.apiBaseUrl") as string;
    this.maxSteps = vscode.workspace
      .getConfiguration("chatgpt")
      .get("gpt3.maxSteps") as number;
    this.claudeCodePath = vscode.workspace
      .getConfiguration("chatgpt")
      .get("gpt3.claudeCodePath") as string;
    this.reasoningModel = vscode.workspace
      .getConfiguration("chatgpt")
      .get("gpt3.reasoning.model") as string;
    this.reasoningAPIBaseUrl = vscode.workspace
      .getConfiguration("chatgpt")
      .get("gpt3.reasoning.apiBaseUrl") as string;
    this.reasoningProvider = vscode.workspace
      .getConfiguration("chatgpt")
      .get("gpt3.reasoning.provider") as string;

    // Azure model names can't contain dots.
    if (this.apiBaseUrl?.includes("azure")) {
      this.model = this.model?.replace(".", "");
    }
  }

  public async closeMCPServers(): Promise<void> {
    if (this.toolSet) {
      for (const client of Object.values(this.toolSet.clients)) {
        await client.close();
      }
    }
    this.toolSet = undefined;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this.webView = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    webviewView.webview.html = this.getWebviewHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "addFreeTextQuestion":
          this.sendApiRequest(data.value, { command: "freeText" });
          break;
        case "editCode":
          const escapedString = (data.value as string).replace(/\$/g, "\\$");
          vscode.window.activeTextEditor?.insertSnippet(
            new vscode.SnippetString(escapedString),
          );

          this.logEvent("code-inserted");
          break;
        case "newCode":
          const newDocument = await vscode.workspace.openTextDocument({
            content: data.value,
            language: this.detectLanguageFromCode(data.value),
          });
          vscode.window.showTextDocument(newDocument);

          this.logEvent("code-opened");
          break;
        case "openNew":
          const document = await vscode.workspace.openTextDocument({
            content: data.value,
            language: data.language,
          });
          vscode.window.showTextDocument(document);

          this.logEvent(
            data.language === "markdown" ? "code-exported" : "code-opened",
          );
          break;
        case "exportConversation":
          const exportedDocument = await vscode.workspace.openTextDocument({
            content: data.value,
            language: "markdown",
          });
          vscode.window.showTextDocument(exportedDocument);
          this.logEvent("conversation-exported");
          break;
        case "clearConversation":
          this.conversationId = undefined;
          this.claudeCodeSessionId = undefined;
          this.chatHistory = [];
          this.conversationContext = {
            files: {},
            filesSent: false,
          };
          // Clear reasoning-related state
          this.reasoning = "";
          this.response = "";
          this.reasoningRounds.clear();
          this.contentSequence = 0;
          this.sendMessage({
            type: "clearFileReferences",
          });
          this.logEvent("conversation-cleared");
          break;
        case "clearBrowser":
          this.logEvent("browser-cleared");
          break;
        case "cleargpt3":
          this.apiCompletion = undefined;
          this.apiChat = undefined;
          this.apiReasoning = undefined;
          this.conversationContext = {
            files: {},
            filesSent: false,
          };
          this.sendMessage({
            type: "clearFileReferences",
          });
          this.logEvent("gpt3-cleared");
          break;
        case "login":
          this.prepareConversation().then((success) => {
            if (success) {
              this.sendMessage(
                {
                  type: "loginSuccessful",
                  showConversations: false,
                },
                true,
              );
              this.logEvent("logged-in");
            }
          });
          break;
        case "openSettings":
          vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "@ext:feiskyer.chatgpt-copilot chatgpt.",
          );

          this.logEvent("settings-opened");
          break;
        case "openSettingsPrompt":
          vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "@ext:feiskyer.chatgpt-copilot promptPrefix",
          );

          this.logEvent("settings-prompt-opened");
          break;
        case "listConversations":
          this.logEvent("conversations-list-attempted");
          break;
        case "showConversation":
          /// ...
          break;
        case "stopGenerating":
          this.stopGenerating();
          break;
        case "selectPrompt":
          try {
            this.systemPromptOverride = data.prompt.content;
            await this.prepareConversation(true);
            this.sendMessage({
              type: "setActivePrompt",
              name: data.prompt.name,
            });
          } catch (error: any) {
            vscode.window.showErrorMessage(
              "Failed to set prompt: " + error.message,
            );
            this.logError("failed-to-set-prompt");
          }
          break;
        case "togglePromptManager":
          await vscode.commands.executeCommand(
            "chatgpt-copilot.togglePromptManager",
          );
          break;
        case "openMCPServers":
          await vscode.commands.executeCommand(
            "chatgpt-copilot.openMCPServers",
          );
          break;
        case "searchPrompts":
          await this.handlePromptSearch(data.query, data.responseType);
          break;
        case "resetPrompt":
          try {
            this.systemPromptOverride = "";
            await this.prepareConversation(true);
            this.sendMessage({
              type: "setActivePrompt",
              name: "",
            });
          } catch (error: any) {
            vscode.window.showErrorMessage(
              "Failed to reset prompt: " + error.message,
            );
            this.logError("failed-to-reset-prompt");
          }
          break;
        case "searchFile":
          await this.handleFileSearch();
          break;
        case "removeFileReference":
          this.handleRemoveFileReference(data.fileName);
          break;
        case "toggleMCPServers":
          await vscode.commands.executeCommand(
            "chatgpt-copilot.openMCPServers",
          );
          break;
        default:
          break;
      }
    });

    if (this.leftOverMessage != null) {
      // If there were any messages that wasn't delivered, render after resolveWebView is called.
      this.sendMessage(this.leftOverMessage);
      this.leftOverMessage = null;
    }

    // Subscribe to editor changes
    this.context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        const autoAddEnabled = vscode.workspace
          .getConfiguration("chatgpt")
          .get<boolean>("autoAddCurrentFile");

        if (autoAddEnabled) {
          // Force cleanup if no editor or if editor is output/debug panel
          if (
            !editor ||
            (editor.document.uri.scheme !== "file" &&
              !editor.document.uri.path.match(
                /\.(jpg|jpeg|png|gif|webp|svg)$/i,
              ))
          ) {
            Object.entries(this.conversationContext.files).forEach(
              ([key, value]) => {
                if (value.isAuto) {
                  this.handleRemoveFileReference(key);
                }
              },
            );
            return;
          }

          this.addCurrentFileToContext();
        }
      }),

      // Add subscription for document close events
      vscode.workspace.onDidCloseTextDocument((document) => {
        console.log("Document closed:", document.uri);
        if (
          (document.uri.scheme === "file" ||
            document.uri.path.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) &&
          !vscode.window.activeTextEditor
        ) {
          Object.entries(this.conversationContext.files).forEach(
            ([key, value]) => {
              if (value.isAuto) {
                this.handleRemoveFileReference(key);
              }
            },
          );
        }
      }),
    );

    // Initial file check
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      const autoAddEnabled = vscode.workspace
        .getConfiguration("chatgpt")
        .get<boolean>("autoAddCurrentFile");

      if (autoAddEnabled) {
        this.addCurrentFileToContext();
      }
    }
  }

  private stopGenerating(): void {
    this.abortController?.abort?.();
    this.inProgress = false;
    this.sendMessage({ type: "showInProgress", inProgress: this.inProgress });
    const responseInMarkdown = !this.isCodexModel;
    this.sendMessage({
      type: "addResponse",
      value: this.response,
      done: true,
      id: this.currentMessageId,
      autoScroll: this.autoScroll,
      responseInMarkdown,
    });
    this.logEvent("stopped-generating");
  }

  public clearSession(): void {
    this.stopGenerating();
    this.apiChat = undefined;
    this.apiReasoning = undefined;
    this.apiCompletion = undefined;
    this.conversationId = undefined;
    this.claudeCodeSessionId = undefined;
    this.logEvent("cleared-session");
  }

  private detectLanguageFromCode(code: string): string {
    // Simple language detection based on common patterns
    const firstLine = code.split("\n")[0].toLowerCase();

    // Check for shebang
    if (firstLine.startsWith("#!")) {
      if (firstLine.includes("python")) {
        return "python";
      }
      if (firstLine.includes("node")) {
        return "javascript";
      }
      if (firstLine.includes("bash") || firstLine.includes("sh")) {
        return "shellscript";
      }
      if (firstLine.includes("ruby")) {
        return "ruby";
      }
      if (firstLine.includes("perl")) {
        return "perl";
      }
    }

    // Check for common language patterns
    if (code.includes("def ") && code.includes(":")) {
      return "python";
    }
    if (
      code.includes("function ") ||
      code.includes("const ") ||
      code.includes("let ") ||
      code.includes("var ")
    ) {
      return "javascript";
    }
    if (code.includes("func ") && code.includes("package ")) {
      return "go";
    }
    if (
      code.includes("public class ") ||
      code.includes("public static void main")
    ) {
      return "java";
    }
    if (code.includes("#include") || code.includes("int main(")) {
      return "cpp";
    }
    if (code.includes("<?php")) {
      return "php";
    }
    if (code.includes("<html") || code.includes("<!DOCTYPE")) {
      return "html";
    }
    if (code.includes("SELECT ") || code.includes("CREATE TABLE")) {
      return "sql";
    }
    if (
      code.includes("impl ") ||
      code.includes("fn ") ||
      code.includes("let mut")
    ) {
      return "rust";
    }
    if (code.includes("interface ") && code.includes(": ")) {
      return "typescript";
    }
    if (code.includes("@import") || code.includes(".css")) {
      return "css";
    }
    if (code.includes("#!/usr/bin/env bash") || code.includes("#!/bin/bash")) {
      return "shellscript";
    }

    // Default to plaintext
    return "plaintext";
  }

  private get isCodexModel(): boolean {
    if (this.model == null) {
      return false;
    }

    return this.model.includes("instruct-") || this.model.includes("code-");
  }

  private get isOpenAIModel(): boolean {
    return (
      !this.isCodexModel && !this.isClaude && !this.isGemini && !this.isXAI
    );
  }

  private get isClaude(): boolean {
    return !!this.model?.startsWith("claude-");
  }

  private get isGemini(): boolean {
    return (
      !!this.model?.startsWith("gemini-") || !!this.model?.startsWith("learnlm")
    );
  }

  private get isAzureOAI(): boolean {
    return !!this.apiBaseUrl?.includes("openai.azure.com");
  }

  private get isAzureAI(): boolean {
    return !!this.apiBaseUrl?.includes("services.ai.azure.com");
  }

  private get isXAI(): boolean {
    return !!this.model?.startsWith("grok-");
  }

  private get aiProvider(): string {
    if (this.provider == "Auto") {
      if (this.isOpenAIModel) {
        return "OpenAI";
      }

      if (this.isClaude) {
        return "Anthropic";
      }

      if (this.isGemini) {
        return "Google";
      }

      if (this.isXAI) {
        return "xAI";
      }

      if (this.isAzureOAI) {
        return "Azure";
      }

      if (this.isAzureAI) {
        return "AzureAI";
      }

      return "OpenAILegacy";
    }

    return this.provider;
  }

  private get reasoningModelProvider(): string {
    if (this.reasoningProvider == "Auto") {
      if (!!this.reasoningModel?.startsWith("claude-")) {
        return "Anthropic";
      }

      if (!!this.reasoningModel?.startsWith("gemini-")) {
        return "Google";
      }

      if (!!this.reasoningModel?.startsWith("grok-")) {
        return "xAI";
      }

      if (!!this.reasoningAPIBaseUrl?.includes("openai.azure.com")) {
        return "Azure";
      }

      if (!!this.reasoningAPIBaseUrl?.includes("services.ai.azure.com")) {
        return "AzureAI";
      }

      return "OpenAI";
    }

    return this.reasoningProvider;
  }

  public async prepareConversation(modelChanged = false): Promise<boolean> {
    this.conversationId = this.conversationId || this.getRandomId();
    const state = this.context.globalState;
    const configuration = vscode.workspace.getConfiguration("chatgpt");
    this.model = configuration.get("gpt3.model") as string;
    this.reasoningModel = configuration.get("gpt3.reasoning.model") as string;
    this.reasoningAPIBaseUrl = configuration.get(
      "gpt3.reasoning.apiBaseUrl",
    ) as string;
    this.provider = configuration.get("gpt3.provider") as string;
    this.claudeCodePath = configuration.get("gpt3.claudeCodePath") as string;
    this.reasoningProvider = configuration.get(
      "gpt3.reasoning.provider",
    ) as string;

    const mcpStore = this.context.globalState.get<{ servers: MCPServer[] }>(
      "mcpServers",
      { servers: [] },
    );
    const enabledServers = mcpStore.servers.filter(
      (server) => server.isEnabled,
    );

    // Only log and initialize MCP servers if configuration has changed and provider is not ClaudeCode
    // Claude Code has its own built-in MCP support, so we skip external MCP server initialization
    if (enabledServers.length > 0 && this.aiProvider !== "ClaudeCode") {
      const needsReinitialization =
        !this.toolSet ||
        Object.keys(this.toolSet.clients).length !== enabledServers.length ||
        !enabledServers.every((server) => this.toolSet!.clients[server.name]);

      if (needsReinitialization) {
        // Only log when actually initializing/reinitializing
        const enabledMcpServers = enabledServers
          .map((server) => server.name)
          .join(", ");
        logger.appendLine(`INFO: enabled MCP servers: ${enabledMcpServers}`);

        // Show loading state in UI
        this.sendMessage({
          type: "showInProgress",
          inProgress: true,
          showStopButton: false,
        });

        // Close existing connections if any
        if (this.toolSet) {
          await this.closeMCPServers();
        }

        try {
          // Create new tool set
          this.toolSet = await createToolSet({
            mcpServers: mcpStore.servers.reduce(
              (
                acc: Record<
                  string,
                  {
                    command: string;
                    args: any;
                    env?: any;
                    isEnabled: boolean;
                    type: string;
                    url: string;
                  }
                >,
                server,
              ) => {
                acc[server.name] = {
                  command: server.command || "",
                  args: server.arguments || [],
                  env: server.env || {},
                  url: server.url || "",
                  isEnabled: server.isEnabled,
                  type: server.type || "local",
                };
                return acc;
              },
              {},
            ),
            onServerStatus: (serverName, status, toolCount, error) => {
              this.sendMessage({
                type: "mcpServerStatus",
                serverName,
                status,
                toolCount,
                error,
              });
            },
          });
        } catch (error) {
          // If all servers fail, still clear the loading state
          logger.appendLine(
            `ERROR: Failed to initialize MCP servers: ${error}`,
          );
        } finally {
          // Clear loading state after all servers are processed
          this.sendMessage({
            type: "showInProgress",
            inProgress: false,
          });
        }
      }
    } else if (
      this.toolSet &&
      (enabledServers.length === 0 || this.aiProvider === "ClaudeCode")
    ) {
      // No enabled servers or using ClaudeCode provider - close any existing MCP connections
      // ClaudeCode has its own built-in MCP support and doesn't need external MCP servers
      await this.closeMCPServers();
    }

    if (this.model == "custom") {
      this.model = configuration.get("gpt3.customModel") as string;
    }

    if (
      (this.isOpenAIModel && !this.apiChat) ||
      (this.isClaude && !this.apiChat) ||
      (this.isGemini && !this.apiChat) ||
      (this.reasoningModel != "" && !this.apiReasoning) ||
      (!this.isOpenAIModel &&
        !this.isClaude &&
        !this.isGemini &&
        !this.apiCompletion) ||
      modelChanged
    ) {
      let apiKey =
        (configuration.get("gpt3.apiKey") as string) ||
        (state.get("chatgpt-gpt3-apiKey") as string);
      const organization = configuration.get("gpt3.organization") as string;
      const maxTokens = configuration.get("gpt3.maxTokens") as number;
      const temperature = configuration.get("gpt3.temperature") as number;
      const topP = configuration.get("gpt3.top_p") as number;
      const searchGrounding = configuration.get(
        "gpt3.searchGrounding.enabled",
      ) as boolean;
      const enableResponsesAPI = configuration.get(
        "gpt3.responsesAPI.enabled",
      ) as boolean;

      let systemPrompt = configuration.get("systemPrompt") as string;
      if (this.systemPromptOverride != "") {
        systemPrompt = this.systemPromptOverride;
      }

      let apiBaseUrl = configuration.get("gpt3.apiBaseUrl") as string;
      if (!apiBaseUrl && this.isOpenAIModel) {
        apiBaseUrl = "https://api.openai.com/v1";
      }
      if (!apiBaseUrl || apiBaseUrl == "https://api.openai.com/v1") {
        if (this.isClaude) {
          apiBaseUrl = "https://api.anthropic.com/v1";
        } else if (this.isGemini) {
          apiBaseUrl = "https://generativelanguage.googleapis.com/v1beta";
        }
      }

      if (!apiKey && process.env.OPENAI_API_KEY != null) {
        apiKey = process.env.OPENAI_API_KEY;
        this.logEvent("api key loaded from environment variable");
      }

      if (!apiKey) {
        vscode.window
          .showErrorMessage(
            "Please add your API Key to use OpenAI official APIs. Storing the API Key in Settings is discouraged due to security reasons, though you can still opt-in to use it to persist it in settings. Instead you can also temporarily set the API Key one-time: You will need to re-enter after restarting the vs-code.",
            "Store in session (Recommended)",
            "Open settings",
          )
          .then(async (choice) => {
            if (choice === "Open settings") {
              vscode.commands.executeCommand(
                "workbench.action.openSettings",
                "chatgpt.gpt3.apiKey",
              );
              return false;
            } else if (choice === "Store in session (Recommended)") {
              await vscode.window
                .showInputBox({
                  title: "Store OpenAI API Key in session",
                  prompt:
                    "Please enter your OpenAI API Key to store in your session only. This option won't persist the token on your settings.json file. You may need to re-enter after restarting your VS-Code",
                  ignoreFocusOut: true,
                  placeHolder: "API Key",
                  value: apiKey || "",
                })
                .then((value) => {
                  if (value) {
                    apiKey = value;
                    state.update("chatgpt-gpt3-apiKey", apiKey);
                    this.sendMessage(
                      {
                        type: "loginSuccessful",
                      },
                      true,
                    );
                  }
                });
            }
          });

        return false;
      }

      const provider = this.aiProvider;
      this.modelConfig = new ModelConfig({
        provider,
        apiKey,
        apiBaseUrl,
        maxTokens,
        temperature,
        topP,
        organization,
        systemPrompt,
        searchGrounding,
        enableResponsesAPI,
        isReasoning: false,
        claudeCodePath: this.claudeCodePath,
        enabledMCPServers: enabledServers,
      });
      if (this.reasoningModel != "") {
        const provider = this.reasoningModelProvider;
        const organization = configuration.get(
          "gpt3.reasoning.organization",
        ) as string;
        const apiBaseUrl = configuration.get(
          "gpt3.reasoning.apiBaseUrl",
        ) as string;
        const apiKey = configuration.get("gpt3.reasoning.apiKey") as string;

        this.reasoningModelConfig = new ModelConfig({
          provider,
          apiKey,
          apiBaseUrl,
          maxTokens,
          temperature,
          topP,
          organization,
          systemPrompt: "",
          searchGrounding,
          enableResponsesAPI,
          isReasoning: true,
          claudeCodePath: this.claudeCodePath,
          enabledMCPServers: enabledServers,
        });
      }

      let configList = [this.modelConfig];
      if (this.reasoningModel != "") {
        configList.push(this.reasoningModelConfig);
      } else {
        this.apiReasoning = undefined;
      }

      try {
        for (const modelConfig of configList) {
          switch (modelConfig.provider) {
            case "OpenAI":
              await initGptModel(this, modelConfig);
              break;

            case "Azure":
              await initGptModel(this, modelConfig);
              break;

            case "AzureAI":
              await initAzureAIModel(this, modelConfig);
              break;

            case "Anthropic":
              await initClaudeModel(this, modelConfig);
              break;

            case "Google":
              await initGeminiModel(this, modelConfig);
              break;

            case "Ollama":
              await initOllamaModel(this, modelConfig);
              break;

            case "Mistral":
              await initMistralModel(this, modelConfig);
              break;

            case "xAI":
              await initXAIModel(this, modelConfig);
              break;

            case "Together":
              await initTogetherModel(this, modelConfig);
              break;

            case "DeepSeek":
              await initDeepSeekModel(this, modelConfig);
              break;

            case "Groq":
              await initGroqModel(this, modelConfig);
              break;

            case "Perplexity":
              await initPerplexityModel(this, modelConfig);
              break;

            case "OpenRouter":
              await initOpenRouterModel(this, modelConfig);
              break;

            case "ClaudeCode":
              await initClaudeCodeModel(this, modelConfig);
              break;

            case "GitHubCopilot":
              break;

            case "Replicate":
              await initReplicateModel(this, modelConfig);
              break;

            default:
              initGptLegacyModel(this, modelConfig);
              break;
          }
        }
      } catch (error) {
        this.logError(`"Unable to initialize model ${error}"`);
        return false;
      }

      if (provider == "GithubCopilot") {
        const models = await vscode.lm.selectChatModels({
          vendor: "copilot",
        });
        logger.appendLine(
          `INFO: available models: ${models.map((m) => m.family).join(", ")}`,
        );
      }
    }

    this.sendMessage({ type: "loginSuccessful" }, true);

    return true;
  }

  private processQuestion(question: string, code?: string, language?: string) {
    if (code != null) {
      // Add prompt prefix to the code if there was a code block selected
      question = `${question}${
        language
          ? ` (The following code is in ${language} programming language)`
          : ""
      }: ${code}`;
    }
    return question + "\r\n";
  }

  public async sendApiRequest(
    prompt: string,
    options: {
      command: string;
      code?: string;
      previousAnswer?: string;
      language?: string;
    },
  ) {
    if (this.inProgress) {
      // The AI is still thinking... Do not accept more questions.
      return;
    }

    this.questionCounter++;

    this.logEvent("api-request-sent", {
      "chatgpt.command": options.command,
      "chatgpt.hasCode": String(!!options.code),
      "chatgpt.hasPreviousAnswer": String(!!options.previousAnswer),
    });

    if (!(await this.prepareConversation())) {
      return;
    }

    this.response = "";
    let question = this.processQuestion(prompt, options.code, options.language);

    // If the ChatGPT view is not in focus/visible; focus on it to render Q&A
    if (this.webView == null) {
      vscode.commands.executeCommand("chatgpt-copilot.view.focus");
    } else {
      this.webView?.show?.(true);
    }

    this.inProgress = true;
    this.abortController = new AbortController();
    this.sendMessage({
      type: "showInProgress",
      inProgress: this.inProgress,
      showStopButton: true,
    });
    this.currentMessageId = this.getRandomId();
    this.contentSequence = 0; // Reset sequence counter for new message

    this.sendMessage({
      type: "addQuestion",
      value: prompt,
      code: options.code,
      autoScroll: this.autoScroll,
    });

    const responseInMarkdown = !this.isCodexModel;
    const startResponse = () => {
      this.sendMessage({
        type: "startResponse",
        value: this.response,
        id: this.currentMessageId,
        messageId: this.currentMessageId,
        autoScroll: this.autoScroll,
        responseInMarkdown,
      });
    };
    const updateResponse = (message: string) => {
      this.response += message;
      this.sendMessage({
        type: "addResponse",
        value: this.response,
        id: this.currentMessageId,
        messageId: this.currentMessageId,
        sequence: ++this.contentSequence,
        autoScroll: this.autoScroll,
        responseInMarkdown,
      });
    };

    const updateReasoning = (message: string, roundNumber?: number) => {
      this.reasoning += message;

      // Determine the current round number
      const currentRound =
        roundNumber || this.reasoningRounds.get(this.currentMessageId) || 1;
      this.reasoningRounds.set(this.currentMessageId, currentRound);

      this.sendMessage({
        type: "addReasoning",
        value: this.reasoning, // Send accumulated reasoning content
        id: this.currentMessageId,
        messageId: this.currentMessageId,
        roundNumber: currentRound,
        sequence: ++this.contentSequence,
        autoScroll: this.autoScroll,
        responseInMarkdown,
      });
    };

    try {
      const imageFiles: Record<string, string> = {};
      if (
        !this.conversationContext.filesSent &&
        Object.keys(this.conversationContext.files).length > 0
      ) {
        const textFiles = Object.entries(this.conversationContext.files)
          .filter(([filepath, file]) => {
            if (file.isImage) {
              imageFiles[filepath] = file.content;
              return false;
            }
            return true;
          })
          .map(
            ([filepath, file]) =>
              `File: ${filepath}\n\`\`\`\n${file.content}\n\`\`\``,
          )
          .join("\n\n");

        if (textFiles) {
          question = `${question}\n\nReferenced files:\n${textFiles}`;
        }

        this.conversationContext.filesSent = true;
      }

      if (this.provider == "OpenAILegacy") {
        await chatCompletion(
          this,
          question,
          imageFiles,
          startResponse,
          updateResponse,
        );
      } else if (this.provider == "GitHubCopilot") {
        await chatCopilot(
          this,
          question,
          imageFiles,
          startResponse,
          updateResponse,
          updateReasoning,
        );
      } else if (this.provider == "ClaudeCode") {
        await chatClaudeCode(
          this,
          question,
          imageFiles,
          startResponse,
          updateResponse,
          updateReasoning,
        );
      } else if (this.reasoningModel != "") {
        await reasoningChat(
          this,
          question,
          imageFiles,
          startResponse,
          updateResponse,
          updateReasoning,
        );
      } else {
        // Check if we should use prompt-based tools
        const configuration = vscode.workspace.getConfiguration("chatgpt");
        const promptBasedToolsEnabled =
          configuration.get("promptBasedTools.enabled") || false;

        if (
          promptBasedToolsEnabled &&
          this.toolSet &&
          Object.keys(this.toolSet.tools).length > 0
        ) {
          // Use prompt-based tools implementation
          const { chatGptWithPromptTools } = require("./prompt-based-chat");
          await chatGptWithPromptTools(
            this,
            question,
            imageFiles,
            startResponse,
            updateResponse,
            updateReasoning,
          );
        } else {
          // Use LLM tools call
          await chatGpt(
            this,
            question,
            imageFiles,
            startResponse,
            updateResponse,
            updateReasoning,
          );
        }
      }

      if (options.previousAnswer != null) {
        this.response = options.previousAnswer + this.response;
      }

      const hasContinuation = this.response.split("```").length % 2 === 0;
      if (hasContinuation) {
        this.response = this.response + " \r\n ```\r\n";
        vscode.window
          .showInformationMessage(
            "It looks like ChatGPT didn't complete their answer for your coding question. You can ask it to continue and combine the answers.",
            "Continue and combine answers",
          )
          .then(async (choice) => {
            if (choice === "Continue and combine answers") {
              this.sendApiRequest("Continue", {
                command: options.command,
                code: undefined,
                previousAnswer: this.response,
              });
            }
          });
      }

      this.sendMessage({
        type: "addResponse",
        value: this.response,
        done: true,
        id: this.currentMessageId,
        messageId: this.currentMessageId,
        autoScroll: this.autoScroll,
        responseInMarkdown,
      });

      if (this.subscribeToResponse) {
        vscode.window
          .showInformationMessage(
            "ChatGPT responded to your question.",
            "Open conversation",
          )
          .then(async () => {
            await vscode.commands.executeCommand("chatgpt-copilot.view.focus");
          });
      }
    } catch (error: any) {
      let message;
      let apiMessage =
        error?.response?.data?.error?.message ||
        error?.tostring?.() ||
        error?.message ||
        error?.name;

      // this.logError(error.stack);
      this.logError("api-request-failed");

      if (error?.response?.status || error?.response?.statusText) {
        message = `${error?.response?.status || ""} ${
          error?.response?.statusText || ""
        }`;

        vscode.window
          .showErrorMessage(
            "An error occured. If this is due to max_token you could try `ChatGPT: Clear Conversation` command and retry sending your prompt.",
            "Clear conversation and retry",
          )
          .then(async (choice) => {
            if (choice === "Clear conversation and retry") {
              await vscode.commands.executeCommand(
                "chatgpt-copilot.clearConversation",
              );
              await delay(250);
              this.sendApiRequest(prompt, {
                command: options.command,
                code: options.code,
              });
            }
          });
      } else if (error.statusCode === 400) {
        message = `Your model: '${this.model}' may be incompatible or one of your parameters is unknown. Reset your settings to default. (HTTP 400 Bad Request)`;
      } else if (error.statusCode === 401) {
        message =
          "Make sure you are properly signed in. If you are using Browser Auto-login method, make sure the browser is open (You could refresh the browser tab manually if you face any issues, too). If you stored your API key in settings.json, make sure it is accurate. If you stored API key in session, you can reset it with `ChatGPT: Reset session` command. (HTTP 401 Unauthorized) Potential reasons: \r\n- 1.Invalid Authentication\r\n- 2.Incorrect API key provided.\r\n- 3.Incorrect Organization provided. \r\n See https://platform.openai.com/docs/guides/error-codes for more details.";
      } else if (error.statusCode === 403) {
        message =
          "Your token has expired. Please try authenticating again. (HTTP 403 Forbidden)";
      } else if (error.statusCode === 404) {
        message = `Your model: '${this.model}' may be incompatible or you may have exhausted your ChatGPT subscription allowance. (HTTP 404 Not Found)`;
      } else if (error.statusCode === 429) {
        message =
          "Too many requests try again later. (HTTP 429 Too Many Requests) Potential reasons: \r\n 1. You exceeded your current quota, please check your plan and billing details\r\n 2. You are sending requests too quickly \r\n 3. The engine is currently overloaded, please try again later. \r\n See https://platform.openai.com/docs/guides/error-codes for more details.";
      } else if (error.statusCode === 500) {
        message =
          "The server had an error while processing your request, please try again. (HTTP 500 Internal Server Error)\r\n See https://platform.openai.com/docs/guides/error-codes for more details.";
      }

      if (apiMessage) {
        message = `${message ? message + " " : ""} ${apiMessage}`;
      }

      this.sendMessage({
        type: "addError",
        value: message,
        autoScroll: this.autoScroll,
      });

      return;
    } finally {
      this.inProgress = false;
      this.sendMessage({ type: "showInProgress", inProgress: this.inProgress });
    }
  }

  /**
   * Message sender, stores if a message cannot be delivered
   * @param message Message to be sent to WebView
   * @param ignoreMessageIfNullWebView We will ignore the command if webView is null/not-focused
   */
  public sendMessage(message: any, ignoreMessageIfNullWebView?: boolean) {
    if (this.webView) {
      this.webView?.webview.postMessage(message);
    } else if (!ignoreMessageIfNullWebView) {
      this.leftOverMessage = message;
    }
  }

  private logEvent(eventName: string, properties?: {}): void {
    if (properties != null) {
      logger.appendLine(
        `INFO ${eventName} chatgpt.model:${this.model} chatgpt.questionCounter:${
          this.questionCounter
        } ${JSON.stringify(properties)}`,
      );
    } else {
      logger.appendLine(`INFO ${eventName} chatgpt.model:${this.model}`);
    }
  }

  private logError(eventName: string): void {
    logger.appendLine(`ERR ${eventName} chatgpt.model:${this.model}`);
  }

  private getWebviewHtml(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "main.js"),
    );
    const stylesMainUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "main.css"),
    );

    const lightSvgUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "mcp.svg"),
    );

    const vendorHighlightCss = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        "media",
        "vendor",
        "highlight.min.css",
      ),
    );
    const vendorJqueryUICss = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        "media",
        "vendor",
        "jquery-ui.css",
      ),
    );
    const vendorHighlightJs = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        "media",
        "vendor",
        "highlight.min.js",
      ),
    );
    const vendorJqueryUIMinJs = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        "media",
        "vendor",
        "jquery-ui.min.js",
      ),
    );
    const vendorJqueryJs = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        "media",
        "vendor",
        "jquery-3.5.1.min.js",
      ),
    );
    const vendorMarkedJs = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        "media",
        "vendor",
        "marked.min.js",
      ),
    );
    const vendorTailwindJs = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        "media",
        "vendor",
        "tailwindcss.3.2.4.min.js",
      ),
    );
    const vendorTurndownJs = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        "media",
        "vendor",
        "turndown.js",
      ),
    );

    const nonce = this.getRandomId();

    return `<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">

				<link href="${stylesMainUri}" rel="stylesheet">
				<link href="${vendorHighlightCss}" rel="stylesheet">
        <link href="${vendorJqueryUICss}" rel="stylesheet">
				<script src="${vendorHighlightJs}"></script>
				<script src="${vendorMarkedJs}"></script>
				<script src="${vendorTailwindJs}"></script>
				<script src="${vendorTurndownJs}"></script>
        <script src="${vendorJqueryJs}"></script>
        <script src="${vendorJqueryUIMinJs}"></script>
        <link href="${webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "tool-call.css"))}" rel="stylesheet">
        <script src="${webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "tool-call.js"))}"></script>
        <script src="${webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "reasoning.js"))}"></script>
       </head>
      <body class="overflow-hidden">
				<div class="flex flex-col h-screen">

					<div id="introduction" class="flex flex-col justify-between h-full justify-center px-6 w-full relative login-screen overflow-auto">
						<div class="flex items-start text-center features-block my-5">
							<div class="flex flex-col gap-3.5 flex-1">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" class="w-6 h-6 m-auto">
									<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"></path>
								</svg>
								<h2>Features</h2>
								<ul class="flex flex-col gap-3.5 text-xs">
                  <li class="features-li w-full border border-zinc-700 p-3 rounded-md">Seamlessly chat with code & docs (@ to add).</li>
                  <li class="features-li w-full border border-zinc-700 p-3 rounded-md">Manage prompts & search custom ones (# to search).</li>
                  <li class="features-li w-full border border-zinc-700 p-3 rounded-md">Enhance code: add tests, fix bugs, and optimize.</li>
                  <li class="features-li w-full border border-zinc-700 p-3 rounded-md">Auto-detect language with syntax highlighting.</li>
                  <li class="features-li w-full border border-zinc-700 p-3 rounded-md">Model Context Protocol (MCP) and DeepClaude mode.</li>
                  </ul>
							</div>
						</div>
						<div class="flex flex-col gap-4 h-full items-center justify-end text-center">
							<p class="max-w-sm text-center text-xs text-slate-500">
								<a title="" id="settings-button" href="#">Update settings</a>&nbsp; | &nbsp;<a title="" id="settings-prompt-button" href="#">Update prompts</a>
							</p>
						</div>
					</div>

          <style>
            /* Customize the dropdown menu */
            .ui-autocomplete {
                background-color: #484a44;
                color: #ffffff;
                border: 1px solid #1f241f;
                width: 200px;
            }

            /* Customize each item in the menu */
            .ui-menu-item {
                padding: 5px 10px;
            }

            /* Customize the item that is currently selected or being hovered over */
            .ui-menu-item.ui-state-focus {
                background-color: #808080 !important;
            }
            .ui-menu-item .ui-menu-item-wrapper.ui-state-active {
                background-color: #808080 !important;
            }
          </style>

					<div class="flex-1 overflow-y-auto" id="qa-list"></div>

					<div class="flex-1 overflow-y-auto hidden" id="conversation-list"></div>

					<div id="in-progress" class="pl-4 pt-2 flex items-center hidden">
						<div class="typing">Thinking</div>
						<div class="spinner">
							<div class="bounce1"></div>
							<div class="bounce2"></div>
							<div class="bounce3"></div>
						</div>

						<button id="stop-button" class="btn btn-primary flex items-end p-1 pr-2 rounded-md ml-5">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15m0 0L7.5 12m4.5 4.5V3" /></svg>Stop responding</button>
					</div>

					<div class="modern-input-container" role="region" aria-label="Chat input area">
						<div class="modern-input-wrapper">
							<div class="modern-input-inner">
								<div id="file-references" class="file-references-modern" role="list" aria-label="Attached files" aria-live="polite"></div>
								<div class="modern-textarea-area">
									<textarea
										type="text"
										rows="1"
										id="question-input"
										placeholder="Ask anything"
										class="modern-textarea"
										aria-label="Type your message here. Use @ to reference files, # to search prompts. Press Enter to send, Shift+Enter for new line."
										aria-describedby="input-help-text"
										role="textbox"
										aria-multiline="true"
										aria-expanded="false"
										aria-autocomplete="list"></textarea>
									<div id="input-help-text" class="sr-only">
										Use @ symbol to reference files in your workspace. Use # symbol to search and insert saved prompts. Press Enter to send your message, or Shift+Enter to add a new line.
									</div>
								</div>
								<div class="modern-button-area" role="toolbar" aria-label="Chat input actions">
									<div class="modern-button-left">
										<button id="new-chat-button"
											title="New chat"
											class="modern-button"
											aria-label="Start a new chat conversation"
											aria-describedby="new-chat-help">
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
												<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
												<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
											</svg>
										</button>
										<div id="new-chat-help" class="sr-only">Start a new conversation</div>
										<button id="file-attachment-button"
											title="Attach file"
											class="modern-button"
											aria-label="Attach file to conversation"
											aria-describedby="attach-help">
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
												<line x1="12" y1="5" x2="12" y2="19"></line>
												<line x1="5" y1="12" x2="19" y2="12"></line>
											</svg>
										</button>
										<div id="attach-help" class="sr-only">Click to open file picker and attach files to your conversation</div>
										<button id="export-button"
											title="Export to markdown"
											class="modern-button"
											aria-label="Export conversation to markdown file"
											aria-describedby="export-help">
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
												<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
												<polyline points="7 10 12 15 17 10"></polyline>
												<line x1="12" y1="15" x2="12" y2="3"></line>
											</svg>
										</button>
										<div id="export-help" class="sr-only">Export conversation to markdown file</div>
									</div>
									<div class="modern-button-right">
										<button id="ask-button"
											title="Submit prompt"
											class="modern-button"
											aria-label="Send message"
											aria-describedby="send-help"
											disabled>
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
												<line x1="22" y1="2" x2="11" y2="13"></line>
												<polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
											</svg>
										</button>
										<div id="send-help" class="sr-only">Send your message to the AI assistant</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>

				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
  }

  private getRandomId() {
    let text = "";
    const possible =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  private async handlePromptSearch(query: string, responseType?: string) {
    const promptStore = this.context.globalState.get<PromptStore>("prompts", {
      prompts: [],
    });

    if (!promptStore.prompts || promptStore.prompts.length === 0) {
      if (responseType === "titles") {
        this.sendMessage({
          type: "promptTitles",
          titles: [],
          isEmpty: true,
        });
      } else {
        this.sendMessage({
          type: "showPromptPicker",
          prompts: [],
          isEmpty: true,
        });
      }
      return;
    }

    const searchText = query.toLowerCase();
    const filteredPrompts = promptStore.prompts.filter(
      (p) =>
        p.name.toLowerCase().includes(searchText) ||
        p.content.toLowerCase().includes(searchText),
    );

    if (responseType === "titles") {
      this.sendMessage({
        type: "promptTitles",
        titles: filteredPrompts.map((p) => ({
          id: p.id,
          name: p.name,
          content: p.content,
        })),
      });
    } else {
      this.sendMessage({
        type: "showPromptPicker",
        prompts: filteredPrompts,
      });
    }
  }

  private async handleFileSearch() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return [];
    }

    try {
      // Exclude node_modules, .git, and other common ignored directories
      const files = await vscode.workspace.findFiles(
        "**/*",
        "{**/node_modules/**,**/.git/**}",
      );

      // Sort files by name and convert to QuickPick items
      const fileItems = files
        .map((file) => ({
          label: vscode.workspace.asRelativePath(file),
          uri: file,
          description: file.fsPath,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));

      const selectedItem = await vscode.window.showQuickPick(fileItems, {
        placeHolder: "Select a file to reference",
        matchOnDescription: true,
        matchOnDetail: true,
      });

      if (selectedItem) {
        try {
          const fileContent = await vscode.workspace.fs.readFile(
            selectedItem.uri,
          );
          const isImage = selectedItem.label.match(
            /\.(jpg|jpeg|png|gif|webp|svg)$/i,
          );

          const content = isImage
            ? Buffer.from(fileContent).toString("base64")
            : Buffer.from(fileContent).toString("utf8");

          this.conversationContext.files[selectedItem.label] = {
            content,
            isAuto: true,
            isImage: !!isImage,
          };
          this.conversationContext.filesSent = false;

          this.sendMessage({
            type: "insertFileReference",
            fileName: selectedItem.label,
            displayName:
              selectedItem.label.split("/").pop() || selectedItem.label,
          });
        } catch (error) {
          console.error("Error reading file:", error);
          vscode.window.showErrorMessage(
            `Failed to read file: ${selectedItem.label}`,
          );

          // Send error feedback to webview
          this.sendMessage({
            type: "fileAttachmentError",
            error: `Failed to read file: ${selectedItem.label}`,
          });
        }
      } else {
        // User cancelled file selection - reset button state
        this.sendMessage({
          type: "fileAttachmentError",
          error: null, // No error message, just reset state
        });
      }
    } catch (error) {
      console.error("Error in handleFileSearch:", error); // Debug log
      vscode.window.showErrorMessage("Failed to search files");

      // Send error feedback to webview
      this.sendMessage({
        type: "fileAttachmentError",
        error: "Failed to search files. Please try again.",
      });
    }
  }

  public handleRemoveFileReference(fileName: string) {
    delete this.conversationContext.files[fileName];
    if (Object.keys(this.conversationContext.files).length > 0) {
      this.conversationContext.filesSent = false;
    }
    this.sendMessage({
      type: "removeFileReference",
      fileName: fileName,
    });
  }

  public async addCurrentFileToContext() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      Object.entries(this.conversationContext.files).forEach(([key, value]) => {
        if (value.isAuto) {
          this.handleRemoveFileReference(key);
        }
      });
      return;
    }

    const fileName = editor.document.fileName;
    if (!fileName) {
      // Handle untitled or unsaved documents
      Object.entries(this.conversationContext.files).forEach(([key, value]) => {
        if (value.isAuto) {
          this.handleRemoveFileReference(key);
        }
      });
      return;
    }
    const displayName = path.basename(fileName);
    const content = editor.document.getText();
    const isImage = displayName.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i);

    if (isImage) {
      const fileContent = await vscode.workspace.fs.readFile(
        editor.document.uri,
      );
      this.conversationContext.files[displayName] = {
        content: Buffer.from(fileContent).toString("base64"),
        isImage: true,
      };
    } else {
      this.conversationContext.files[displayName] = {
        content,
        isImage: false,
      };
    }

    this.conversationContext.filesSent = false;
    this.sendMessage({
      type: "insertFileReference",
      fileName: fileName,
      displayName: fileName.split("/").pop() || fileName,
      isAuto: true,
    });
  }
}
