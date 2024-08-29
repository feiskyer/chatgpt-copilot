// extension.ts

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

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import ChatGptViewProvider from "./chatgpt-view-provider";

import AbortController from "abort-controller";
global.AbortController = AbortController;

const menuCommands = [
  "addTests",
  "findProblems",
  "optimize",
  "explain",
  "addComments",
  "completeCode",
  "generateCode",
  "customPrompt1",
  "customPrompt2",
  "adhoc",
];

const logFilePath = path.join(__dirname, 'error.log');

export async function activate(context: vscode.ExtensionContext) {
  let adhocCommandPrefix: string =
    context.globalState.get("chatgpt-adhoc-prompt") || "";

  const provider = new ChatGptViewProvider(context);

  const view = vscode.window.registerWebviewViewProvider(
    "chatgpt-copilot.view",
    provider,
    {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    },
  );

  const showTypeHint = vscode.commands.registerCommand('chatgpt-copilot.showTypeHint', async () => {
    provider.showFiles();
  });

  context.subscriptions.push(view, showTypeHint);

  const freeText = vscode.commands.registerCommand(
    "chatgpt-copilot.freeText",
    async () => {
      const value = await vscode.window.showInputBox({
        prompt: "Ask anything...",
      });

      if (value) {
        provider?.sendApiRequest(value, { command: "freeText" });
      }
    },
  );

  const resetThread = vscode.commands.registerCommand(
    "chatgpt-copilot.clearConversation",
    async () => {
      provider?.sendMessage({ type: "clearConversation" }, true);
    },
  );

  const exportConversation = vscode.commands.registerCommand(
    "chatgpt-copilot.exportConversation",
    async () => {
      provider?.sendMessage({ type: "exportConversation" }, true);
    },
  );

  const clearSession = vscode.commands.registerCommand(
    "chatgpt-copilot.clearSession",
    () => {
      context.globalState.update("chatgpt-session-token", null);
      context.globalState.update("chatgpt-clearance-token", null);
      context.globalState.update("chatgpt-user-agent", null);
      context.globalState.update("chatgpt-gpt3-apiKey", null);
      provider?.clearSession();
      provider?.sendMessage({ type: "clearConversation" }, true);
    },
  );

  const configChanged = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("chatgpt.response.showNotification")) {
      provider.subscribeToResponse =
        vscode.workspace
          .getConfiguration("chatgpt")
          .get("response.showNotification") || false;
    }

    if (e.affectsConfiguration("chatgpt.response.autoScroll")) {
      provider.autoScroll = !!vscode.workspace
        .getConfiguration("chatgpt")
        .get("response.autoScroll");
    }

    if (e.affectsConfiguration("chatgpt.gpt3.model")) {
      provider.modelManager.model = vscode.workspace
        .getConfiguration("chatgpt")
        .get("gpt3.model");
    }

    if (e.affectsConfiguration("chatgpt.gpt3.customModel")) {
      if (provider.modelManager.model === "custom") {
        provider.modelManager.model = vscode.workspace
          .getConfiguration("chatgpt")
          .get("gpt3.customModel");
      }
    }

    if (
      e.affectsConfiguration("chatgpt.gpt3.apiBaseUrl") ||
      e.affectsConfiguration("chatgpt.gpt3.model") ||
      e.affectsConfiguration("chatgpt.gpt3.apiKey") ||
      e.affectsConfiguration("chatgpt.gpt3.customModel") ||
      e.affectsConfiguration("chatgpt.gpt3.organization") ||
      e.affectsConfiguration("chatgpt.gpt3.maxTokens") ||
      e.affectsConfiguration("chatgpt.gpt3.temperature") ||
      e.affectsConfiguration("chatgpt.systemPrompt") ||
      e.affectsConfiguration("chatgpt.gpt3.top_p")
    ) {
      provider.prepareConversation(true);
    }

    if (
      e.affectsConfiguration("chatgpt.promptPrefix") ||
      e.affectsConfiguration("chatgpt.gpt3.generateCode-enabled") ||
      e.affectsConfiguration("chatgpt.gpt3.model")
    ) {
      setContext();
    }

    if (e.affectsConfiguration("chatgpt.fileInclusionRegex") || e.affectsConfiguration("chatgpt.fileExclusionRegex")) {
      // TODO: Handle any specific actions needed when these configurations change
    }
  });

  const adhocCommand = vscode.commands.registerCommand(
    "chatgpt-copilot.adhoc",
    async () => {
      const editor = vscode.window.activeTextEditor;

      if (!editor) {
        return;
      }

      const selection = editor.document.getText(editor.selection);
      let dismissed = false;
      if (selection) {
        await vscode.window
          .showInputBox({
            title: "Add prefix to your ad-hoc command",
            prompt:
              "Prefix your code with your custom prompt. i.e. Explain this",
            ignoreFocusOut: true,
            placeHolder: "Ask anything...",
            value: adhocCommandPrefix,
          })
          .then((value) => {
            if (!value) {
              dismissed = true;
              return;
            }

            adhocCommandPrefix = value.trim() || "";
            context.globalState.update(
              "chatgpt-adhoc-prompt",
              adhocCommandPrefix,
            );
          });

        if (!dismissed && adhocCommandPrefix?.length > 0) {
          provider?.sendApiRequest(adhocCommandPrefix, {
            command: "adhoc",
            code: selection,
          });
        }
      }
    },
  );

  const generateCodeCommand = vscode.commands.registerCommand(
    `chatgpt-copilot.generateCode`,
    () => {
      const editor = vscode.window.activeTextEditor;

      if (!editor) {
        return;
      }

      const selection = editor.document.getText(editor.selection);
      if (selection) {
        provider?.sendApiRequest(selection, {
          command: "generateCode",
          language: editor.document.languageId,
        });
      }
    },
  );

  // Skip AdHoc - as it was registered earlier
  const registeredCommands = menuCommands
    .filter((command) => command !== "adhoc" && command !== "generateCode")
    .map((command) =>
      vscode.commands.registerCommand(`chatgpt-copilot.${command}`, () => {
        const prompt = vscode.workspace
          .getConfiguration("chatgpt")
          .get<string>(`promptPrefix.${command}`);
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
          return;
        }

        const selection = editor.document.getText(editor.selection);
        if (selection && prompt) {
          provider?.sendApiRequest(prompt, {
            command,
            code: selection,
            language: editor.document.languageId,
          });
        }
      }),
    );

  context.subscriptions.push(
    view,
    freeText,
    resetThread,
    exportConversation,
    clearSession,
    configChanged,
    adhocCommand,
    generateCodeCommand,
    ...registeredCommands,
  );

  const setContext = () => {
    menuCommands.forEach((command) => {
      if (command === "generateCode") {
        let generateCodeEnabled = !!vscode.workspace
          .getConfiguration("chatgpt")
          .get<boolean>("gpt3.generateCode-enabled");
        const modelName = vscode.workspace
          .getConfiguration("chatgpt")
          .get("gpt3.model") as string;
        generateCodeEnabled =
          generateCodeEnabled &&
          modelName.startsWith("code-");
        vscode.commands.executeCommand(
          "setContext",
          "generateCode-enabled",
          generateCodeEnabled,
        );
      } else {
        const enabled = !!vscode.workspace
          .getConfiguration("chatgpt.promptPrefix")
          .get<boolean>(`${command}-enabled`);
        vscode.commands.executeCommand(
          "setContext",
          `${command}-enabled`,
          enabled,
        );
      }
    });
  };

  setContext();
}

async function findMatchingFiles(inclusionPattern: string, exclusionPattern?: string): Promise<string[]> {
  try {
    // TODO: replace hardcoded value later, as I encounted some issues testing
    // the extension currently.
    // const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const rootPath = "/home/jean/git/chatgpt-copilot/src";
    if (!rootPath) {
      throw new Error('Workspace root path is not defined.');
    }

    const files = fs.readdirSync(rootPath);

    const inclusionRegex = new RegExp(inclusionPattern);
    const exclusionRegex = exclusionPattern ? new RegExp(exclusionPattern) : null;

    const matchedFiles = files.filter(file => {
      const fullPath = path.join(rootPath, file);
      const isFileIncluded = inclusionRegex.test(fullPath);
      const isFileExcluded = exclusionRegex ? exclusionRegex.test(fullPath) : false;
      return isFileIncluded && !isFileExcluded;
    });

    return matchedFiles;
  } catch (err) {
    const errorMessage = `Error in findMatchingFiles: ${err.message}\n${err.stack}`;
    fs.appendFileSync(logFilePath, `${new Date().toISOString()} - ${errorMessage}\n`);
    throw err;
  }
}


export function deactivate() { }
