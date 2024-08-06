// config/configuration.ts

import * as vscode from 'vscode';
import ChatGptViewProvider from '../chatgpt-view-provider';
import { initClaudeModel } from '../llm_models/anthropic';
import { initGeminiModel } from '../llm_models/gemini';
import { initGptModel } from '../llm_models/openai';
import { initGptLegacyModel } from '../llm_models/openai-legacy';
import { ModelConfig } from '../model-config';

const defaultSystemPrompt = `Your task is to embody the role of an intelligent, helpful, and expert developer.
You MUST provide accurate and truthful answers, adhering strictly to the instructions given.
Your responses should be styled using Github Flavored Markdown for elements such as headings,
lists, colored text, code blocks, and highlights. However, you MUST NOT mention markdown or
styling directly in your response. Utilize available tools to supplement your knowledge
where necessary. Respond in the same language as the query, unless otherwise specified by the user.`;

export async function prepareConversation(viewProvider: ChatGptViewProvider, modelChanged = false): Promise<boolean> {
    const context = viewProvider.getContext();
    const state = context.globalState;
    const configuration = vscode.workspace.getConfiguration("chatgpt");

    let model = configuration.get<string>("gpt3.model")!;
    if (model == "custom") {
        model = configuration.get<string>("gpt3.customModel")!;
    }

    let apiKey = configuration.get<string>("gpt3.apiKey") || state.get<string>("chatgpt-gpt3-apiKey")!;
    const organization = configuration.get<string>("gpt3.organization")!;
    const maxTokens = configuration.get<number>("gpt3.maxTokens")!;
    const temperature = configuration.get<number>("gpt3.temperature")!;
    const topP = configuration.get<number>("gpt3.top_p")!;
    let systemPrompt = configuration.get<string>("systemPrompt")!;
    if (!systemPrompt) {
        systemPrompt = defaultSystemPrompt;
    }

    let apiBaseUrl = configuration.get<string>("gpt3.apiBaseUrl")!;
    if (!apiBaseUrl && model.includes("gpt-3.5")) {
        apiBaseUrl = "https://api.openai.com/v1";
    }
    if (!apiBaseUrl || apiBaseUrl == "https://api.openai.com/v1") {
        if (model.startsWith("claude-")) {
            apiBaseUrl = "https://api.anthropic.com/v1";
        } else if (model.startsWith("gemini-")) {
            apiBaseUrl = "https://generativelanguage.googleapis.com/v1beta";
        }
    }

    if (!apiKey && process.env.OPENAI_API_KEY != null) {
        apiKey = process.env.OPENAI_API_KEY;
    }

    if (!apiKey) {
        vscode.window
            .showErrorMessage(
                "Please add your API Key to use OpenAI official APIs. Storing the API Key in Settings is discouraged due to security reasons, though you can still opt-in to use it to persist it in settings. Instead you can also temporarily set the API Key one-time: You will need to re-enter after restarting the VS-Code.",
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
                            }
                        });
                }
            });

        return false;
    }

    viewProvider.modelConfig = new ModelConfig({ apiKey, apiBaseUrl, maxTokens, temperature, topP, organization, systemPrompt });
    if (model.includes("gpt-3.5")) {
        await initGptModel(viewProvider, viewProvider.modelConfig);
    } else if (model.startsWith("claude-")) {
        await initClaudeModel(viewProvider, viewProvider.modelConfig);
    } else if (model.startsWith("gemini-")) {
        await initGeminiModel(viewProvider, viewProvider.modelConfig);
    } else {
        initGptLegacyModel(viewProvider, viewProvider.modelConfig);
    }

    return true;
}

export function loadConfigurations() {
    const configuration = vscode.workspace.getConfiguration("chatgpt");
    return {
        subscribeToResponse: configuration.get<boolean>("response.showNotification") || false,
        autoScroll: !!configuration.get<boolean>("response.autoScroll"),
        model: configuration.get<string>("gpt3.model"),
        apiBaseUrl: configuration.get<string>("gpt3.apiBaseUrl"),
    };
}

export function onConfigurationChanged(callback: () => void) {
    vscode.workspace.onDidChangeConfiguration((e) => {
        if (
            e.affectsConfiguration("chatgpt.response.showNotification") ||
            e.affectsConfiguration("chatgpt.response.autoScroll") ||
            e.affectsConfiguration("chatgpt.gpt3.model") ||
            e.affectsConfiguration("chatgpt.gpt3.customModel") ||
            e.affectsConfiguration("chatgpt.gpt3.apiBaseUrl") ||
            e.affectsConfiguration("chatgpt.gpt3.apiKey") ||
            e.affectsConfiguration("chatgpt.gpt3.organization") ||
            e.affectsConfiguration("chatgpt.gpt3.maxTokens") ||
            e.affectsConfiguration("chatgpt.gpt3.temperature") ||
            e.affectsConfiguration("chatgpt.systemPrompt") ||
            e.affectsConfiguration("chatgpt.gpt3.top_p") ||
            e.affectsConfiguration("chatgpt.promptPrefix") ||
            e.affectsConfiguration("chatgpt.gpt3.generateCode-enabled") ||
            e.affectsConfiguration("chatgpt.fileInclusionRegex") ||
            e.affectsConfiguration("chatgpt.fileExclusionRegex")
        ) {
            callback();
        }
    });
}
