// chatgpt-view-provider.ts

/* eslint-disable eqeqeq */
/* eslint-disable @typescript-eslint/naming-convention */
/**
 * @author Pengfei Ni
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

import { OpenAIChatLanguageModel, OpenAICompletionLanguageModel } from "@ai-sdk/openai/internal";
import { LanguageModelV1 } from "@ai-sdk/provider";
import { CoreMessage } from "ai";
import delay from "delay";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { initClaudeModel } from "./anthropic";
import { initGeminiModel } from "./gemini";
import { ModelConfig } from "./model-config";
import { chatGpt, initGptModel } from "./openai";
import { chatCompletion, initGptLegacyModel } from "./openai-legacy";
import { getApiKey } from './utils/api-key';

// Ensure configuration methods are imported if refactored
// import { loadConfigurations, prepareConversation, onConfigurationChanged } from './config/configuration';

const logFilePath = path.join(__dirname, 'error.log');

enum CommandType {
  AddFreeTextQuestion = "addFreeTextQuestion",
  EditCode = "editCode",
  OpenNew = "openNew",
  ClearConversation = "clearConversation",
  ClearBrowser = "clearBrowser",
  ClearGpt3 = "cleargpt3",
  Login = "login",
  OpenSettings = "openSettings",
  OpenSettingsPrompt = "openSettingsPrompt",
  ListConversations = "listConversations",
  ShowConversation = "showConversation",
  StopGenerating = "stopGenerating"
}

enum LogLevel {
  Info = "INFO",
  Debug = "DEBUG",
  Error = "ERROR",
}

const defaultSystemPrompt = `You are a software engineer GPT specialized in refining and enhancing code quality through adherence to fundamental software engineering principles, including SOLID, KISS (Keep It Simple, Stupid), YAGNI (You Aren't Gonna Need It), DRY (Don't Repeat Yourself), and best practices for code consistency, clarity, and error handling. Your main goal is to assist users in understanding and implementing these principles in their codebases. You provide detailed explanations, examples, and best practices, focusing on:

1. **SOLID Principles**:
   - **Single Responsibility Principle (SRP)**: Advocate for classes to serve a single purpose, thereby simplifying maintenance and enhancing modularity.
   - **Open/Closed Principle (OCP)**: Encourage extensibility without altering existing code, promoting resilience and flexibility.
   - **Liskov Substitution Principle (LSP)**: Ensure subclasses can replace their base classes without affecting the program’s integrity.
   - **Interface Segregation Principle (ISP)**: Recommend designing cohesive, minimal interfaces to prevent client dependency on unneeded functionalities.
   - **Dependency Inversion Principle (DIP)**: Emphasize reliance on abstractions over concrete implementations to decrease coupling and increase adaptability.

2. **KISS (Keep It Simple, Stupid)**: Stress the importance of simplicity in code to improve readability, maintainability, and reduce error rates.

3. **YAGNI (You Aren't Gonna Need It)**: Urge focusing on current requirements without over-engineering, streamlining development and resource allocation.

4. **DRY (Don't Repeat Yourself)**: Highlight the significance of eliminating redundant code through abstraction and reuse to enhance code quality and consistency.

5. **Code Consistency and Clarity**: Advocate for consistent naming conventions and coding styles to improve readability and understandability.

6. **Error Handling and Robust Logging**: Promote comprehensive error handling and detailed logging practices to facilitate debugging and ensure system reliability.

7. **Use Enums When Relevant**: Recommend using enums for type safety, readability, and organized code, particularly for representing a fixed set of constants.

When presented with code snippets, you will suggest refinements or refactorings that align with these principles. Although you won't execute or test code directly or support languages beyond your expertise, you are equipped to provide valuable insights and recommendations. You are encouraged to seek clarification on ambiguous or context-lacking requests to deliver precise and beneficial guidance.

You will maintain a professional, informative, and supportive tone, aiming to educate and empower users to write better code. This is very important to my career. Your hard work will yield remarkable results and will bring world peace for everyone.`;

class Logger {
  private outputChannel: vscode.OutputChannel;

  constructor(channelName: string) {
    this.outputChannel = vscode.window.createOutputChannel(channelName);
  }

  public logToFile(message: string) {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFilePath, `${timestamp} - ${message}\n`);
  }

  public logToOutputChannel(message: string) {
    this.outputChannel.appendLine(`${new Date().toISOString()} - ${message}`);
  }

  public log(level: LogLevel, message: string, properties?: any) {
    const formattedMessage = `${level} ${message} ${properties ? JSON.stringify(properties) : ''}`;
    this.logToOutputChannel(formattedMessage);
    if (level === LogLevel.Error) {
      this.logToFile(formattedMessage);
    }
  }
}

export default class ChatGptViewProvider implements vscode.WebviewViewProvider {
  private webView?: vscode.WebviewView;
  private logger: Logger;
  public subscribeToResponse: boolean;
  public autoScroll: boolean;
  public model?: string;
  private apiBaseUrl?: string;
  public modelConfig!: ModelConfig;
  public apiCompletion?: OpenAICompletionLanguageModel | LanguageModelV1;
  public apiChat?: OpenAIChatLanguageModel | LanguageModelV1;
  public conversationId?: string;
  public questionCounter: number = 0;
  public inProgress: boolean = false;
  public abortController?: AbortController;
  public currentMessageId: string = "";
  public response: string = "";
  public chatHistory: CoreMessage[] = [];
  private leftOverMessage?: any;
  /**
   * Message to be rendered lazily if they haven't been rendered
   * in time before resolveWebviewView is called.
   */
  private leftOverMessage?: any;

  constructor(private context: vscode.ExtensionContext) {
    // Use the original configuration loading approach
    this.logger = new Logger("ChatGPT Copilot");
    this.subscribeToResponse = this.getConfig<boolean>("response.showNotification") || false;
    this.autoScroll = !!this.getConfig<boolean>("response.autoScroll");
    this.model = this.getRequiredConfig<string>("gpt3.model");

    if (this.model == "custom") {
      this.model = this.getRequiredConfig<string>("gpt3.customModel");
    }
    this.apiBaseUrl = this.getRequiredConfig<string>("gpt3.apiBaseUrl");

    // Azure model names can't contain dots.
    if (this.apiBaseUrl?.includes("azure")) {
      this.model = this.model?.replace(".", "");
    }

    this.logger.log(LogLevel.Info, "ChatGptViewProvider initialized");

    // Ensure to handle configuration changes dynamically
    // onConfigurationChanged(() => {
    //   const config = loadConfigurations();
    //   this.subscribeToResponse = config.subscribeToResponse;
    //   this.autoScroll = config.autoScroll;
    //   this.model = config.model;
    //   this.apiBaseUrl = config.apiBaseUrl;

    //   // Azure model names can't contain dots.
    //   if (this.apiBaseUrl?.includes("azure")) {
    //     this.model = this.model?.replace(".", "");
    //   }
    // });
  }

  /**
   * Resolves the webview view with the provided context and sets up necessary event handling.
   * @param webviewView - The webview view that is being resolved.
   * @param _context - Context information related to the webview view.
   * @param _token - A cancellation token to signal if the operation is cancelled.
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this.logger.log(LogLevel.Info, "resolveWebviewView called");

    this.webView = webviewView;
    this.setupWebview(webviewView);
    this.handleWebviewMessages(webviewView);
  }

  /**
   * Sets up the webview with HTML content and webview options.
   * @param webviewView - The webview view to be set up.
   */
  private setupWebview(webviewView: vscode.WebviewView) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    webviewView.webview.html = this.getWebviewHtml(webviewView.webview);
    this.logger.log(LogLevel.Info, "Webview resolved");
  }

  /**
   * Retrieves a configuration value based on the specified key.
   * @param key - The configuration key to look up.
   * @param defaultValue - Optional default value to return if the configuration value is not found.
   * @returns The configuration value of type T or the defaultValue if it is not found.
   */
  private getConfig<T>(key: string, defaultValue?: T): T {
    return vscode.workspace.getConfiguration("chatgpt").get(key, defaultValue) as T;
  }

  /**
  * Retrieves a required configuration value based on the specified key.
  * Throws an error if the value is not found.
  * @param key - The configuration key to look up.
  * @returns The configuration value of type T.
  * @throws An error if the configuration value is not found.
  */
  private getRequiredConfig<T>(key: string): T {
    const value = this.getConfig<T>(key);
    if (value === undefined) {
      throw new Error(`Configuration value for "${key}" is required but not found.`);
    }
    return value;
  }

  private commandHandlers: { [key: string]: (...args: any[]) => Promise<void>; } = {
    [CommandType.AddFreeTextQuestion]: this.handleAddFreeTextQuestion.bind(this),
    [CommandType.EditCode]: this.handleEditCode.bind(this),
    [CommandType.OpenNew]: this.handleOpenNew.bind(this),
    [CommandType.ClearConversation]: this.handleClearConversation.bind(this),
    [CommandType.ClearBrowser]: this.handleClearBrowser.bind(this),
    [CommandType.ClearGpt3]: this.handleClearGpt3.bind(this),
    [CommandType.Login]: this.handleLogin.bind(this),
    [CommandType.OpenSettings]: this.handleOpenSettings.bind(this),
    [CommandType.OpenSettingsPrompt]: this.handleOpenSettingsPrompt.bind(this),
    [CommandType.ListConversations]: this.handleListConversations.bind(this),
    [CommandType.StopGenerating]: this.handleStopGenerating.bind(this),
  };

  /**
   * Handles incoming messages from the webview and dispatches them to the appropriate command handlers.
   * @param webviewView - The webview view that is sending messages.
   */
  private handleWebviewMessages(webviewView: vscode.WebviewView) {
    webviewView.webview.onDidReceiveMessage(async (data) => {
      this.logger.log(LogLevel.Info, `Message received of type: ${data.type}`);
      const handler = this.commandHandlers[data.type];
      if (handler) {
        try {
          await handler(data.value, data.language);
        } catch (error) {
          this.logger.log(LogLevel.Error, `Error handling command ${data.type}: ${error.message}`);
        }
      }
    });

    if (this.leftOverMessage != null) {
      // If there were any messages that wasn't delivered, render after resolveWebView is called.
      this.sendMessage(this.leftOverMessage);
      this.leftOverMessage = null;
    }
  }

  /**
   * Handles the command to add a free text question to the chat.
   * @param question - The question to be added.
   */
  private async handleAddFreeTextQuestion(question: string) {
    this.sendApiRequest(question, { command: "freeText" });
  }

  /**
   * Handles the command to edit code by inserting the provided code snippet 
   * into the active text editor.
   * @param code - The code to be inserted in the current text editor.
   */
  private async handleEditCode(code: string) {
    const escapedString = code.replace(/\$/g, "\\$");
    vscode.window.activeTextEditor?.insertSnippet(new vscode.SnippetString(escapedString));
    this.logger.log(LogLevel.Info, "code-inserted");
  }

  /**
   * Handles the command to open a new text document with the specified content and language.
   * @param content - The content to be placed in the new document.
   * @param language - The programming language of the new document.
   */
  private async handleOpenNew(content: string, language: string) {
    const document = await vscode.workspace.openTextDocument({ content, language });
    vscode.window.showTextDocument(document);
    this.logger.log(LogLevel.Info, language === "markdown" ? "code-exported" : "code-opened");
  }

  /**
   * Clears the current conversation by resetting the conversation ID and chat history.
   */
  private async handleClearConversation() {
    this.conversationId = undefined;
    this.chatHistory = [];
    this.logger.log(LogLevel.Info, "conversation-cleared");
  }

  private async handleClearBrowser() {
    // TODO: implement this later ?
    this.logger.log(LogLevel.Info, "browser-cleared");
  }

  private async handleClearGpt3() {
    this.apiCompletion = undefined;
    this.apiChat = undefined;
    this.logger.log(LogLevel.Info, "gpt3-cleared");
  }

  private async handleLogin() {
    const success = await this.prepareConversation();
    if (success) {
      this.sendMessage(
        {
          type: "loginSuccessful",
          showConversations: false,
        },
        true,
      );
      this.logger.log(LogLevel.Info, "logged-in");
    }
  }

  private async handleOpenSettings() {
    await vscode.commands.executeCommand(
      "workbench.action.openSettings",
      "@ext:feiskyer.chatgpt-copilot chatgpt.",
    );

    this.logger.log(LogLevel.Info, "settings-opened");
  }

  private async handleOpenSettingsPrompt() {
    await vscode.commands.executeCommand(
      "workbench.action.openSettings",
      "@ext:feiskyer.chatgpt-copilot promptPrefix",
    );

    this.logger.log(LogLevel.Info, "settings-prompt-opened");
  }

  private async handleListConversations() {
    // TODO: implement this later ?
    this.logger.log(LogLevel.Info, "conversations-list-attempted");
  }

  private async handleStopGenerating(): Promise<void> {
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
    this.logger.log(LogLevel.Info, "stopped-generating");
  }

  public clearSession(): void {
    this.handleStopGenerating();
    this.apiChat = undefined;
    this.apiCompletion = undefined;
    this.conversationId = undefined;
    this.logger.log(LogLevel.Info, "cleared-session");
  }

  private get isCodexModel(): boolean {
    if (this.model == null) {
      return false;
    }

    return this.model.includes("instruct") || this.model.includes("code-");
  }

  private get isGpt35Model(): boolean {
    return !this.isCodexModel && !this.isClaude && !this.isGemini;
  }

  private get isClaude(): boolean {
    return !!this.model?.startsWith("claude-");
  }

  private get isGemini(): boolean {
    return !!this.model?.startsWith("gemini-");
  }

  /**
   * Prepares the conversation context and initializes the appropriate AI model based on current configurations.
   * @param modelChanged - A flag indicating whether the model has changed.
   * @returns A Promise which resolves to a boolean indicating success or failure.
   */
  public async prepareConversation(modelChanged = false): Promise<boolean> {
    this.logger.log(LogLevel.Info, "prepareConversation called", { modelChanged });

    this.conversationId = this.conversationId || this.getRandomId();
    const configuration = vscode.workspace.getConfiguration("chatgpt");

    if (this.model == "custom") {
      this.model = configuration.get("gpt3.customModel") as string;
    }

    if (
      (this.isGpt35Model && !this.apiChat) ||
      (this.isClaude && !this.apiChat) ||
      (this.isGemini && !this.apiChat) ||
      (!this.isGpt35Model && !this.isClaude && !this.isGemini && !this.apiCompletion) ||
      modelChanged
    ) {
      let apiKey = await getApiKey();

      if (!apiKey) {
        return false; // Exit if API key is not obtained
      }

      const organization = configuration.get("gpt3.organization") as string;
      const maxTokens = configuration.get("gpt3.maxTokens") as number;
      const temperature = configuration.get("gpt3.temperature") as number;
      const topP = configuration.get("gpt3.top_p") as number;

      let systemPrompt = configuration.get("systemPrompt") as string;
      if (!systemPrompt) {
        systemPrompt = defaultSystemPrompt;
      }

      let apiBaseUrl = configuration.get("gpt3.apiBaseUrl") as string;
      if (!apiBaseUrl && this.isGpt35Model) {
        apiBaseUrl = "https://api.openai.com/v1";
      }
      if (!apiBaseUrl || apiBaseUrl == "https://api.openai.com/v1") {
        if (this.isClaude) {
          apiBaseUrl = "https://api.anthropic.com/v1";
        } else if (this.isGemini) {
          apiBaseUrl = "https://generativelanguage.googleapis.com/v1beta";
        }
      }

      this.modelConfig = new ModelConfig(
        { apiKey, apiBaseUrl, maxTokens, temperature, topP, organization, systemPrompt },
      );
      if (this.isGpt35Model) {
        await initGptModel(this, this.modelConfig);
      } else if (this.isClaude) {
        await initClaudeModel(this, this.modelConfig);
      } else if (this.isGemini) {
        await initGeminiModel(this, this.modelConfig);
      } else {
        initGptLegacyModel(this, this.modelConfig);
      }
    }

    this.sendMessage({ type: "loginSuccessful" }, true);
    this.logger.log(LogLevel.Info, "prepareConversation completed successfully");

    return true;
  }

  /**
   * Processes the provided question, appending contextual information from the current project files.
   * @param question - The original question to process.
   * @param code - Optional code block associated with the question.
   * @param language - The programming language of the code, if present.
   * @returns A Promise that resolves to the processed question string.
   */
  private async processQuestion(question: string, code?: string, language?: string) {
    this.logger.log(LogLevel.Info, "processQuestion called");

    // Get the inclusion and exclusion regex from the configuration
    const inclusionRegex = this.getConfig<string>("fileInclusionRegex");
    const exclusionRegex = this.getConfig<string>("fileExclusionRegex");

    if (!inclusionRegex) {
      vscode.window.showErrorMessage("Inclusion regex is not set in the configuration.");
      this.logger.log(LogLevel.Info, "Inclusion regex is not set in the configuration.");
      return question; // Return the original question if regex is not set
    }

    // Find matching files
    this.logger.log(LogLevel.Info, "will call findMatchingFiles");
    const files = await this.findMatchingFiles(inclusionRegex, exclusionRegex);

    // Get the content of the matched files
    this.logger.log(LogLevel.Info, "will call getFilesContent");
    const contextContent = await this.getFilesContent(files);

    // Add the context content to the question
    if (code != null) {
      // Add prompt prefix to the code if there was a code block selected
      question = `${question}${language ? ` (The following code is in ${language} programming language)` : ""}: ${code}`;
    }

    // Append the context content to the question
    this.logger.log(LogLevel.Info, "returning question processed...");
    return `${contextContent}\n\n${question}\r\n`;

    // if (code != null) {
    //   // Add prompt prefix to the code if there was a code block selected
    //   question = `${question}${language
    //     ? ` (The following code is in ${language} programming language)`
    //     : ""
    //     }: ${code}`;
    // }
    // return question + "\r\n";
  }

  /**
   * Sends an API request to generate a response to the provided prompt.
   * @param prompt - The prompt to be sent to the API.
   * @param options - Additional options related to the API call, including command, code, etc.
   */
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

    this.logger.log(LogLevel.Info, "api-request-sent", {
      "chatgpt.command": options.command,
      "chatgpt.hasCode": String(!!options.code),
      "chatgpt.hasPreviousAnswer": String(!!options.previousAnswer),
    });

    if (!(await this.prepareConversation())) {
      return;
    }

    this.response = "";
    let question = await this.processQuestion(prompt, options.code, options.language);

    this.logger.log(LogLevel.Info, "processQuestion done");

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

    this.sendMessage({
      type: "addQuestion",
      value: prompt,
      code: options.code,
      autoScroll: this.autoScroll,
    });

    try {
      await this.getChatResponse(question, options);
    } catch (error: any) {
      this.handleError(error, prompt, options);
    } finally {
      this.inProgress = false;
      this.sendMessage({ type: "showInProgress", inProgress: this.inProgress });
    }
  }

  private async getChatResponse(question: string, options: any) {
    const responseInMarkdown = !this.isCodexModel;
    const updateResponse = (message: string) => {
      this.response += message;
      this.sendMessage({
        type: "addResponse",
        value: this.response,
        id: this.currentMessageId,
        messageId: this.currentMessageId,
        autoScroll: this.autoScroll,
        responseInMarkdown,
      });
    };

    if (this.isGpt35Model || this.isClaude || this.isGemini) {
      await chatGpt(this, question, updateResponse);
    } else {
      await chatCompletion(this, question, updateResponse);
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
  }

  /**
   * Handles errors that occur during API requests, logging the error and
   * interacting with the user to provide feedback on the issue.
   * @param error - The error object that was thrown during the API request.
   * @param prompt - The original prompt that was being processed.
   * @param options - Options related to the API request that failed.
   */
  private handleError(error: any, prompt: string, options: any) {
    let message;
    let apiMessage =
      error?.response?.data?.error?.message ||
      error?.tostring?.() ||
      error?.message ||
      error?.name;

    this.logger.log(LogLevel.Error, "api-request-failed");

    if (error?.response?.status || error?.response?.statusText) {
      message = `${error?.response?.status || ""} ${error?.response?.statusText || ""
        }`;

      vscode.window
        .showErrorMessage(
          "An error occured. If this is due to max_token you could try `ChatGPT: Clear Conversation` command and retry sending your prompt.",
          "Clear conversation and retry",
        )
        .then(async (choice) => {
          if (choice === "Clear conversation and retry") {
            await vscode.commands.executeCommand("chatgpt-copilot.clearConversation");
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
  }

  private async findMatchingFiles(inclusionPattern: string, exclusionPattern?: string): Promise<string[]> {
    try {
      // TODO: replace hardcoded value later, as I encounted some issues testing
      // the extension currently.
      // const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
      const rootPath = "/home/jean/git/chatgpt-copilot";
      if (!rootPath) {
        throw new Error('Workspace root path is not defined.');
      }

      // Log patterns
      this.logger.log(LogLevel.Info, "Inclusion Pattern", { inclusionPattern });
      if (exclusionPattern) {
        this.logger.log(LogLevel.Info, "Exclusion Pattern", { exclusionPattern });
      }


      const walk = (dir: string, fileList: string[] = []): string[] => {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
          const fullPath = path.join(dir, file);
          if (fs.statSync(fullPath).isDirectory()) {
            walk(fullPath, fileList);
          } else {
            fileList.push(fullPath);
          }
        });
        return fileList;
      };

      const files = walk(rootPath);

      // Log all found files before filtering
      // this.logger.log(LogLevel.Debug, "All found files", { files });
      // Convert all found files to relative paths and log them
      // const relativeFiles = files.map(file => path.relative(rootPath, file));
      // this.logger.log(LogLevel.Debug, "All found files (relative paths)", { relativeFiles });

      const inclusionRegex = new RegExp(inclusionPattern);
      const exclusionRegex = exclusionPattern ? new RegExp(exclusionPattern) : null;

      const matchedFiles = files.filter(file => {
        const relativePath = path.relative(rootPath, file);
        const isFileIncluded = inclusionRegex.test(relativePath);
        const isFileExcluded = exclusionRegex ? exclusionRegex.test(relativePath) : false;
        return isFileIncluded && !isFileExcluded;
      });

      this.logger.log(LogLevel.Info, "Matched files", { matchedFiles });

      return matchedFiles;
    } catch (err) {
      const errorMessage = `Error in findMatchingFiles: ${err.message}\n${err.stack}`;
      this.logger.log(LogLevel.Error, errorMessage);
      throw err;
    }
  }

  /**
   * Sends a message to the webview and handles cases where the webview is not focused.
   * If the webview is null, messages are stored for later sending when the webview becomes available.
   * @param message - The message to be sent to the webview.
   * @param ignoreMessageIfNullWebView - A flag indicating whether to ignore the message if the webview is null.
   */
  public sendMessage(message: any, ignoreMessageIfNullWebView?: boolean) {
    if (this.webView) {
      this.webView?.webview.postMessage(message);
    } else if (!ignoreMessageIfNullWebView) {
      this.leftOverMessage = message;
    }
    this.logger.log(LogLevel.Info, "Message sent", { message });
  }

  /**
   * Retrieves the HTML content for the webview based on the specified configuration.
   * @param webview - The webview for which the HTML content is generated.
   * @returns A string that contains the HTML content for the webview.
   */
  private getWebviewHtml(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "main.js"),
    );
    const stylesMainUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "main.css"),
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
        "hjquery-ui.css",
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
                  <li class="features-li w-full border border-zinc-700 p-3 rounded-md">Chat with your code and documents in conversations</li>
                  <li class="features-li w-full border border-zinc-700 p-3 rounded-md">Improve your code, add tests & find bugs</li>
                  <li class="features-li w-full border border-zinc-700 p-3 rounded-md">Copy or create new files automatically</li>
                  <li class="features-li w-full border border-zinc-700 p-3 rounded-md">Syntax highlighting with auto language detection</li>
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

          <div class="p-4 flex items-center pt-2">
            <div class="flex-1 textarea-wrapper">
              <textarea
                type="text"
                rows="1"
                id="question-input"
                placeholder="Ask a question..."
                onInput="this.parentNode.dataset.replicatedValue = this.value"></textarea>
            </div>
            <div id="chat-button-wrapper" class="absolute bottom-14 items-center more-menu right-8 border border-gray-200 shadow-xl hidden text-xs">
              <button class="flex gap-2 items-center justify-start p-2 w-full" id="clear-button"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" /></svg>&nbsp;New chat</button>
              <button class="flex gap-2 items-center justify-start p-2 w-full" id="settings-button"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>&nbsp;Update settings</button>
              <button class="flex gap-2 items-center justify-start p-2 w-full" id="export-button"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>&nbsp;Export to markdown</button>
            </div>
            <div id="question-input-buttons" class="right-6 absolute p-0.5 ml-5 flex items-center gap-2">
              <button id="more-button" title="More actions" class="rounded-lg p-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" /></svg>
              </button>

              <button id="ask-button" title="Submit prompt" class="ask-button rounded-lg p-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
              </button>
            </div>
          </div>
        </div>

        <script nonce="${nonce}" src="${scriptUri}"></script>
        <script nonce="${nonce}">
          (function() {
            const vscode = acquireVsCodeApi();

            document.getElementById('settings-button').addEventListener('click', () => {
              vscode.postMessage({ type: 'openSettings' });
            });

            document.getElementById('settings-prompt-button').addEventListener('click', () => {
              vscode.postMessage({ type: 'openSettingsPrompt' });
            });

            document.getElementById('clear-button').addEventListener('click', () => {
              vscode.postMessage({ type: 'clearConversation' });
            });

            document.getElementById('ask-button').addEventListener('click', () => {
              const questionInput = document.getElementById('question-input');
              const question = questionInput.value;
              questionInput.value = '';
              vscode.postMessage({ type: 'addFreeTextQuestion', value: question });
            });

            document.getElementById('stop-button').addEventListener('click', () => {
              vscode.postMessage({ type: 'stopGenerating' });
            });

            document.getElementById('more-button').addEventListener('click', () => {
              const chatButtonWrapper = document.getElementById('chat-button-wrapper');
              chatButtonWrapper.classList.toggle('hidden');
            });

            window.addEventListener('message', event => {
              const message = event.data;
              switch (message.type) {
                case 'addQuestion':
                  addQuestion(message.value, message.code);
                  break;
                case 'addResponse':
                  addResponse(message.value, message.done);
                  break;
                case 'addError':
                  addError(message.value);
                  break;
                case 'showInProgress':
                  toggleInProgress(message.inProgress);
                  break;
                default:
                  break;
              }
            });

            function addQuestion(question, code) {
              const qaList = document.getElementById('qa-list');
              const questionElement = document.createElement('div');
              questionElement.className = 'question-item';
              questionElement.innerHTML = \`
                <div class="question">
                  <strong>Q:</strong> \${question}
                  \${code ? \`<pre><code>\${code}</code></pre>\` : ''}
                </div>
              \`;
              qaList.appendChild(questionElement);
            }

            function addResponse(response, done) {
              const qaList = document.getElementById('qa-list');
              const lastQuestion = qaList.lastElementChild;
              const responseElement = document.createElement('div');
              responseElement.className = 'response-item';
              responseElement.innerHTML = \`
                <div class="response">
                  <strong>A:</strong> \${response}
                </div>
              \`;
              if (done) {
                responseElement.classList.add('done');
              }
              lastQuestion.appendChild(responseElement);
            }

            function addError(error) {
              const qaList = document.getElementById('qa-list');
              const errorElement = document.createElement('div');
              errorElement.className = 'error-item';
              errorElement.innerHTML = \`
                <div class="error">
                  <strong>Error:</strong> \${error}
                </div>
              \`;
              qaList.appendChild(errorElement);
            }

            function toggleInProgress(inProgress) {
              const inProgressElement = document.getElementById('in-progress');
              if (inProgress) {
                inProgressElement.classList.remove('hidden');
              } else {
                inProgressElement.classList.add('hidden');
              }
            }
          })();
        </script>
      </body>
      </html>`;
  }

  /**
  * Gets a random ID for use in message identifiers or other unique purposes.
  * @returns A randomly generated string ID.
  */
  private getRandomId() {
    let text = "";
    const possible =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  /**
   * Updates the list of files in the webview with information about 
   * the available files in the current project.
   * @param files - An array of file objects containing path and line numbers.
   */
  public updateFilesList(files: { path: string; lines: number; }[]) {
    if (this.webView) {
      this.webView.webview.postMessage({ type: "updateFilesList", files });
    } else {
      this.leftOverMessage = { type: "updateFilesList", files };
    }
  }

  /**
   * Displays a list of files that match the inclusion and exclusion patterns 
   * specified in the configuration.
   */
  public async showFiles() {
    const inclusionRegex = this.getConfig<string>("fileInclusionRegex");
    const exclusionRegex = this.getConfig<string>("fileExclusionRegex");

    if (!inclusionRegex) {
      vscode.window.showErrorMessage("Inclusion regex is not set in the configuration.");
      return;
    }

    // Log patterns
    this.logger.log(LogLevel.Info, "showFiles called", { inclusionRegex, exclusionRegex });

    try {
      const files = await this.findMatchingFiles(inclusionRegex, exclusionRegex);
      const filesWithLineCount = files.map(file => ({
        path: file,
        lines: getLineCount(file)
      }));
      this.updateFilesList(filesWithLineCount);
    } catch (err) {
      const errorMessage = `Error finding files: ${err.message}\n${err.stack}`;
      vscode.window.showErrorMessage(errorMessage);
      this.logger.log(LogLevel.Error, errorMessage);
    }
  }

  /**
   * Retrieves the context of the current extension, which contains useful state information.
   * @returns The extension context associated with the provider.
   */
  public getContext() {
    return this.context;
  }

  /**
   * Retrieves the content of specified files and formats them for inclusion in a prompt to the AI model.
   * Each file's content is prefixed with its relative path.
   * @param files - An array of file paths to retrieve content from.
   * @returns A Promise that resolves to a string containing the formatted content of the files.
   */
  private async getFilesContent(files: string[]): Promise<string> {
    const fileContents: string[] = [];

    for (const file of files) {
      const relativePath = path.relative("/home/jean/git/chatgpt-copilot", file); // Adjust the root path accordingly
      const content = fs.readFileSync(file, 'utf-8');
      fileContents.push(`// -----\n// File: ${relativePath}\n// Content below: ${content}\n-----`);
    }

    return fileContents.join('\n\n'); // Join all file contents with double line breaks
  };
}

/**
 * Counts the number of lines in a specified file.
 * @param filePath - The path of the file to count lines in.
 * @returns The number of lines in the file.
 */
function getLineCount(filePath: string): number {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  return fileContent.split('\n').length;
}
