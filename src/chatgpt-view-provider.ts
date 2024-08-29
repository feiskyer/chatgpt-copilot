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
import { CommandHandler } from "./commandHandler";
import { getConfig, onConfigurationChanged } from "./config/configuration";
import { ConfigurationManager } from "./configurationManager";
import { chatGpt } from "./llm_models/openai";
import { chatCompletion } from "./llm_models/openai-legacy";
import { LogLevel, Logger } from "./logger";
import { ModelManager } from "./modelManager";
import { WebviewManager } from "./webviewManager";

const logFilePath = path.join(__dirname, 'error.log');

export enum CommandType {
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

export interface ChatGptViewProviderOptions {
  context: vscode.ExtensionContext;
  logger: Logger;
  webviewManager: WebviewManager;
  commandHandler: CommandHandler;
  modelManager: ModelManager;
  configurationManager: ConfigurationManager;
}

export class ChatGptViewProvider implements vscode.WebviewViewProvider {
  private webView?: vscode.WebviewView;
  private logger: Logger;
  private context: vscode.ExtensionContext;
  public webviewManager: WebviewManager; // Responsible for handling webview initialization and interactions.
  public modelManager: ModelManager;
  public configurationManager: ConfigurationManager; // Responsible for managing and loading configuration values.
  public commandHandler: CommandHandler; // CommandHandler: Responsible for managing command execution.
  // ChatHistoryManager: Manages chat history and conversation state.
  // APIManager: Handles API interactions with different models.
  // MessageHandler: Responsible for handling incoming messages from the webview, dispatching, and handling responses.

  public apiCompletion?: OpenAICompletionLanguageModel | LanguageModelV1;
  public apiChat?: OpenAIChatLanguageModel | LanguageModelV1;
  public conversationId?: string;
  public questionCounter: number = 0;
  public inProgress: boolean = false;
  public abortController?: AbortController;
  public currentMessageId: string = "";
  public response: string = "";
  public chatHistory: CoreMessage[] = [];

  /**
   * Message to be rendered lazily if they haven't been rendered
   * in time before resolveWebviewView is called.
   */
  private leftOverMessage?: any;

  constructor(options: ChatGptViewProviderOptions) {
    const { context, logger, webviewManager, commandHandler, modelManager, configurationManager } = options;
    this.context = context;
    this.logger = logger;
    this.webviewManager = webviewManager;
    this.commandHandler = commandHandler;
    this.modelManager = modelManager;
    this.configurationManager = configurationManager;

    this.configurationManager.loadConfiguration();

    onConfigurationChanged(() => {
      this.configurationManager.loadConfiguration();
    });

    this.logger.log(LogLevel.Info, "ChatGptViewProvider initialized");
  }

  public getWorkspaceConfiguration() {
    return vscode.workspace.getConfiguration("chatgpt");
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
    this.webviewManager.setupWebview(webviewView, this.context.extensionUri, this.getRandomId());
    this.handleWebviewMessages(webviewView);
  }

  /**
   * Handles incoming messages from the webview and dispatches them to the appropriate command handlers.
   * @param webviewView - The webview view that is sending messages.
   */
  private handleWebviewMessages(webviewView: vscode.WebviewView) {
    webviewView.webview.onDidReceiveMessage(async (data: {
      type: CommandType;
      value: any;
      language?: string;
    }) => {
      this.logger.log(LogLevel.Info, `Message received of type: ${data.type}`);

      try {
        await this.commandHandler.executeCommand(data.type, data, this);
      } catch (error) {
        // Specify the expected error type if possible
        if (error instanceof Error) {
          this.logger.log(LogLevel.Error, `Error handling command ${data.type}: ${error.message}`);
        } else {
          // Handle unexpected error types
          this.logger.log(LogLevel.Error, `Unexpected error handling command ${data.type}: ${String(error)}`);
        }
      }
    });
  }

  public sendMessage(message: any) {
    this.webviewManager.sendMessage(message);
  }

  public async handleShowConversation() {
    // Logic to show the conversation goes here.
    this.logger.log(LogLevel.Info, "Showing conversation...");
    // You can add additional implementation details here if necessary.
  }


  /**
   * Handles the command to add a free text question to the chat.
   * @param question - The question to be added.
   */
  public async handleAddFreeTextQuestion(question: string) {
    // Clear chat history if conversationHistoryEnabled is false
    if (!this.configurationManager.conversationHistoryEnabled) {
      this.chatHistory = [];
    }
    this.sendApiRequest(question, { command: "freeText" });
  }

  /**
   * Handles the command to edit code by inserting the provided code snippet 
   * into the active text editor.
   * @param code - The code to be inserted in the current text editor.
   */
  public async handleEditCode(code: string) {
    const escapedString = code.replace(/\$/g, "\\$");
    vscode.window.activeTextEditor?.insertSnippet(new vscode.SnippetString(escapedString));
    this.logger.log(LogLevel.Info, "code-inserted");
  }

  /**
   * Handles the command to open a new text document with the specified content and language.
   * @param content - The content to be placed in the new document.
   * @param language - The programming language of the new document.
   */
  public async handleOpenNew(content: string, language: string) {
    const document = await vscode.workspace.openTextDocument({ content, language });
    vscode.window.showTextDocument(document);
    this.logger.log(LogLevel.Info, language === "markdown" ? "code-exported" : "code-opened");
  }

  /**
   * Clears the current conversation by resetting the conversation ID and chat history.
   */
  public async handleClearConversation() {
    this.conversationId = undefined;
    this.chatHistory = [];
    this.logger.log(LogLevel.Info, "conversation-cleared");
  }

  public async handleClearBrowser() {
    // TODO: implement this later ?
    this.logger.log(LogLevel.Info, "browser-cleared");
  }

  public async handleClearGpt3() {
    this.apiCompletion = undefined;
    this.apiChat = undefined;
    this.logger.log(LogLevel.Info, "gpt3-cleared");
  }

  public async handleLogin() {
    const success = await this.prepareConversation();
    if (success) {
      this.sendMessage({ type: "loginSuccessful", showConversations: false });
      this.logger.log(LogLevel.Info, "logged-in");
    }
  }

  public async handleOpenSettings() {
    await vscode.commands.executeCommand(
      "workbench.action.openSettings",
      "@ext:feiskyer.chatgpt-copilot chatgpt.",
    );
    this.logger.log(LogLevel.Info, "settings-opened");
  }

  public async handleOpenSettingsPrompt() {
    await vscode.commands.executeCommand(
      "workbench.action.openSettings",
      "@ext:feiskyer.chatgpt-copilot promptPrefix",
    );
    this.logger.log(LogLevel.Info, "settings-prompt-opened");
  }

  public async handleListConversations() {
    // TODO: implement this later ?
    this.logger.log(LogLevel.Info, "conversations-list-attempted");
  }

  public async handleStopGenerating(): Promise<void> {
    this.abortController?.abort?.();
    this.inProgress = false;
    this.sendMessage({ type: "showInProgress", inProgress: this.inProgress });
    const responseInMarkdown = !this.modelManager.isCodexModel;
    this.sendMessage({
      type: "addResponse",
      value: this.response,
      done: true,
      id: this.currentMessageId,
      autoScroll: this.configurationManager.autoScroll,
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

  /**
   * Prepares the conversation context and initializes the appropriate AI model based on current configurations.
   * @param modelChanged - A flag indicating whether the model has changed.
   * @returns A Promise which resolves to a boolean indicating success or failure.
   */
  public async prepareConversation(modelChanged = false): Promise<boolean> {
    this.logger.log(LogLevel.Info, "prepareConversation called", { modelChanged });

    this.conversationId = this.conversationId || this.getRandomId();

    if (await this.modelManager.prepareModelForConversation(modelChanged, this.logger, this)) {
      this.sendMessage({ type: "loginSuccessful" });
      this.logger.log(LogLevel.Info, "prepareConversation completed successfully");
      return true;
    } else {
      return false;
    }
  }

  /**
   * Retrieves additional context from the codebase to be included in the prompt.
   * This function finds files that match the inclusion pattern and retrieves their content.
   * @returns A Promise that resolves to a string containing the formatted content.
   */
  public async retrieveContextForPrompt(): Promise<string> {
    try {
      const inclusionRegex = getConfig<string>("fileInclusionRegex");
      const exclusionRegex = getConfig<string>("fileExclusionRegex");

      if (!inclusionRegex) {
        vscode.window.showErrorMessage("Inclusion regex is not set in the configuration.");
        this.logger.log(LogLevel.Info, "Inclusion regex is not set in the configuration.");
        return "";  // Return an empty string if the regex is not set
      }

      // Find matching files
      this.logger.log(LogLevel.Info, "Finding matching files");
      const files = await this.findMatchingFiles(inclusionRegex, exclusionRegex);

      // Get the content of the matched files
      this.logger.log(LogLevel.Info, "Retrieving file content");
      const contextContent = await this.getFilesContent(files);

      // Generate context for prompt
      const formattedContext = this.generateFormattedContext(contextContent);

      return formattedContext;
    } catch (error) {
      if (error instanceof Error) {
        // Properly log the error message
        this.logger.log(LogLevel.Error, `Error retrieving context: ${error.message}`);
      } else {
        // Handle cases where the error is not an instance of Error
        this.logger.log(LogLevel.Error, `Unknown error: ${String(error)}`);
      }

      throw error; // Rethrow the error if necessary
    }
  }

  /**
  * Generates a formatted context string from the content of files.
  * The context is structured with a title and section headers for each file's content.
  * 
  * @param fileContents - A string containing the content of files, 
  *                      where each file's content is separated by double new lines.
  * @returns A string that represents the formatted context, ready for use in a prompt.
  */
  private generateFormattedContext(fileContents: string): string {
    // Split by double new lines to handle separate file contents
    const contentSections = fileContents.split('\n\n');

    // Prepend a title for the context
    const contextTitle = "### Context from Project Files:\n\n";

    // Format each section with index for better context understanding
    const formattedContents = contentSections.map((content, idx) => {
      return `#### File ${idx + 1}:\n${content}`;
    }).join('\n\n'); // Join the formatted contents with double new lines

    return contextTitle + formattedContents; // Combine title and contents
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

    // Format the question to send, keeping the context separate
    const formattedQuestion = code != null
      ? `${question}${language ? ` (The following code is in ${language} programming language)` : ""}: ${code}`
      : question;

    // Append the context content to the question
    this.logger.log(LogLevel.Info, "returning question processed...");
    return formattedQuestion;


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

    // Retrieve the additional context
    const additionalContext = await this.retrieveContextForPrompt();

    const formattedQuestion = await this.processQuestion(prompt, options.code, options.language);
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
      autoScroll: this.configurationManager.autoScroll,
    });

    try {
      await this.getChatResponse(formattedQuestion, additionalContext, options);
    } catch (error: any) {
      this.handleError(error, formattedQuestion, options);
    } finally {
      this.inProgress = false;
      this.sendMessage({ type: "showInProgress", inProgress: this.inProgress });
    }
  }

  /**
   * Sends a prompt to the AI model and receives a response while updating the 
   * response incrementally. It handles the streaming of the AI's response and 
   * updates the chat history accordingly.
   * 
   * @param prompt - The prompt to be sent to the AI model.
   * @param additionalContext - Additional contextual information to prefix to the prompt, if provided.
   * @param options - An object containing command options, including any previous responses.
   * @throws Throws an error if the response cannot be generated due to an issue with the API.
   */
  private async getChatResponse(
    prompt: string,
    additionalContext: string,
    options: { command: string; previousAnswer?: string; },
  ) {
    const responseInMarkdown = !this.modelManager.isCodexModel;
    const updateResponse = (message: string) => {
      this.response += message;
      this.sendMessage({
        type: "addResponse",
        value: this.response,
        id: this.currentMessageId,
        messageId: this.currentMessageId,
        autoScroll: this.configurationManager.autoScroll,
        responseInMarkdown,
      });
    };

    if (this.modelManager.isGpt35Model || this.modelManager.isClaude || this.modelManager.isGemini) {
      this.logger.log(LogLevel.Info, `Using AI model: ${this.modelManager.model} for prompt: ${prompt}`);
      await chatGpt(this, prompt, updateResponse, additionalContext);
    } else {
      this.logger.log(LogLevel.Info, `Using legacy model for prompt: ${prompt}`);
      await chatCompletion(this, prompt, updateResponse, additionalContext);
    }

    // Check for previous answer and append it to the response if applicable
    if (options.previousAnswer != null) {
      this.response = options.previousAnswer + this.response; // Combine with previous answer
    }

    // Handling potential incomplete responses
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
      autoScroll: this.configurationManager.autoScroll,
      responseInMarkdown,
    });

    if (this.configurationManager.subscribeToResponse) {
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
      message = `Your model: '${this.modelManager.model}' may be incompatible or one of your parameters is unknown. Reset your settings to default. (HTTP 400 Bad Request)`;
    } else if (error.statusCode === 401) {
      message =
        "Make sure you are properly signed in. If you are using Browser Auto-login method, make sure the browser is open (You could refresh the browser tab manually if you face any issues, too). If you stored your API key in settings.json, make sure it is accurate. If you stored API key in session, you can reset it with `ChatGPT: Reset session` command. (HTTP 401 Unauthorized) Potential reasons: \r\n- 1.Invalid Authentication\r\n- 2.Incorrect API key provided.\r\n- 3.Incorrect Organization provided. \r\n See https://platform.openai.com/docs/guides/error-codes for more details.";
    } else if (error.statusCode === 403) {
      message =
        "Your token has expired. Please try authenticating again. (HTTP 403 Forbidden)";
    } else if (error.statusCode === 404) {
      message = `Your model: '${this.modelManager.model}' may be incompatible or you may have exhausted your ChatGPT subscription allowance. (HTTP 404 Not Found)`;
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
      autoScroll: this.configurationManager.autoScroll,
    });

    return;
  }

  /**
   * Finds files in the workspace that match the inclusion pattern and do not match the exclusion pattern.
   * @param inclusionPattern - Regex pattern to include files.
   * @param exclusionPattern - Optional regex pattern to exclude files.
   * @returns A Promise that resolves to an array of matching file paths.
   */
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
    } catch (error) {
      // Check if error is an instance of Error
      let errorMessage: string;

      if (error instanceof Error) {
        errorMessage = `Error in findMatchingFiles: ${error.message}\n${error.stack}`;
      } else {
        // Fallback for unknown error types
        errorMessage = `Unknown error in findMatchingFiles: ${String(error)}`;
      }

      this.logger.log(LogLevel.Error, errorMessage);
      throw error; // Rethrow the error so it can be handled by the caller
    }
  }

  /**
  * Gets a random ID for use in message identifiers or other unique purposes.
  * @returns A randomly generated string ID.
  */
  private getRandomId(): string {
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
    const inclusionRegex = getConfig<string>("fileInclusionRegex");
    const exclusionRegex = getConfig<string>("fileExclusionRegex");

    if (!inclusionRegex) {
      vscode.window.showErrorMessage("Inclusion regex is not set in the configuration.");
      return [];
    }

    this.logger.log(LogLevel.Info, "Inclusion Regex: ", inclusionRegex);
    this.logger.log(LogLevel.Info, "Exclusion Regex: ", exclusionRegex);

    try {
      const files = await this.findMatchingFiles(inclusionRegex, exclusionRegex);
      this.logger.log(LogLevel.Info, "Matched Files: ", files);

      const filesWithLineCount = files.map(file => ({
        path: file,
        lines: getLineCount(file)
      }));
      this.updateFilesList(filesWithLineCount);

      return files;  // Return matched files
    } catch (error) {
      let errorMessage: string;

      if (error instanceof Error) {
        errorMessage = `Error finding files: ${error.message}\n${error.stack}`;
      } else {
        // Fallback for unknown error types
        errorMessage = `Unknown error finding files: ${String(error)}`;
      }

      vscode.window.showErrorMessage(errorMessage);
      this.logger.log(LogLevel.Error, errorMessage);
      return [];
    }
  }

  /**
   * Retrieves the context of the current extension, which contains useful state information.
   * This function finds files that match the inclusion pattern and retrieves their content.
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
export function getLineCount(filePath: string): number {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  return fileContent.split('\n').length;
}
