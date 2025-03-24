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
import * as vscode from "vscode";
import { Prompt, PromptStore } from "./types";

export default class PromptManagerProvider implements vscode.WebviewViewProvider {
    private webView?: vscode.WebviewView;
    private store: PromptStore = { prompts: [] };
    private _panel?: vscode.WebviewPanel;

    constructor(private context: vscode.ExtensionContext) {
        this.loadPrompts();
    }

    private loadPrompts() {
        this.store = this.context.globalState.get<PromptStore>("prompts", { prompts: [] });
    }

    private savePrompts() {
        this.context.globalState.update("prompts", this.store);
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

        webviewView.webview.html = this.getWebviewContent(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case "addPrompt":
                    this.addPrompt(data.prompt);
                    break;
                case "updatePrompt":
                    this.updatePrompt(data.prompt);
                    break;
                case "deletePrompt":
                    this.deletePrompt(data.id);
                    break;
                case "getPrompts":
                    this.handleGetPrompts(webviewView.webview);
                    break;
            }
        });
    }

    public addPrompt(prompt: Omit<Prompt, "id" | "createdAt" | "updatedAt">) {
        const now = Date.now();
        const newPrompt: Prompt = {
            id: this.generateId(),
            ...prompt,
            createdAt: now,
            updatedAt: now
        };
        this.store.prompts.push(newPrompt);
        this.savePrompts();
        this.sendPromptsToAll(this.store.prompts);
    }

    public updatePrompt(prompt: Prompt) {
        const index = this.store.prompts.findIndex(p => p.id === prompt.id);
        if (index !== -1) {
            this.store.prompts[index] = {
                ...prompt,
                updatedAt: Date.now()
            };
            this.savePrompts();
            this.sendPromptsToAll(this.store.prompts);
        }
    }

    public deletePrompt(id: string) {
        this.store.prompts = this.store.prompts.filter(p => p.id !== id);
        this.savePrompts();
        this.sendPromptsToAll(this.store.prompts);
    }

    private sendPromptsToAll(prompts: Prompt[]) {
        this.webView?.webview.postMessage({
            type: "updatePrompts",
            prompts: prompts
        });

        if (this._panel?.webview) {
            this._panel.webview.postMessage({
                type: "updatePrompts",
                prompts: prompts
            });
        }
    }

    private generateId(): string {
        return Math.random().toString(36).substring(2) + Date.now().toString(36);
    }

    public getPrompts() {
        return this.store.prompts;
    }

    public setPanel(panel: vscode.WebviewPanel | undefined) {
        this._panel = panel;
    }

    public getWebviewContent(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, "media", "prompt-manager.js")
        );
        const stylesUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, "media", "prompt-manager.css")
        );
        const tailwindUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, "media", "vendor", "tailwindcss.3.2.4.min.js")
        );

        return `<!DOCTYPE html>
        <html>
            <head>
                <link href="${stylesUri}" rel="stylesheet">
                <script src="${tailwindUri}"></script>
            </head>
            <body class="overflow-hidden">
                <div class="flex flex-col h-screen">
                    <div class="flex-1 overflow-y-auto p-4">
                        <div class="flex items-center justify-between mb-6">
                            <div class="flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <h2 class="text-lg font-semibold">Prompt Manager</h2>
                            </div>
                            <button id="addPrompt" class="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                </svg>
                                New Prompt
                            </button>
                        </div>
                        <div id="promptList" class="space-y-4"></div>
                    </div>
                </div>
                <script src="${scriptUri}"></script>
            </body>
        </html>`;
    }

    private handleGetPrompts(webview: vscode.Webview) {
        webview.postMessage({
            type: "updatePrompts",
            prompts: this.store.prompts
        });
    }
} 