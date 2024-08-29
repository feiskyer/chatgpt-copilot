import * as vscode from "vscode";
import { LogLevel, Logger } from "./logger";

export class WebviewManager {
    private webviewView?: vscode.WebviewView;
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    /**
     * Sets up the webview with HTML content and webview options.
     * @param webviewView - The webview view to be set up.
     */
    public setupWebview(webviewView: vscode.WebviewView, extensionUri: vscode.Uri, nonce: string) {
        this.webviewView = webviewView;
        this.logger.log(LogLevel.Info, "Webview set");
        this.webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [extensionUri],
        };

        this.webviewView.webview.html = this.getWebviewHtml(extensionUri, nonce);
        this.logger.log(LogLevel.Info, "Webview resolved");
    }

    /**
     * Sends a message to the webview and handles cases where the webview is not focused.
     * @param message - The message to be sent to the webview.
     */
    public sendMessage(message: any) {
        if (this.webviewView) {
            this.webviewView.webview.postMessage(message);
        } else {
            this.logger.log(LogLevel.Error, "Failed to send message: Webview is not set");
        }
    }

    /**
     * Retrieves the HTML content for the webview based on the specified configuration.
     * @param webview - The webview for which the HTML content is generated.
     * @returns A string that contains the HTML content for the webview.
     */
    private getWebviewHtml(extensionUri: vscode.Uri, nonce: string): string {
        if (this.webviewView) {
            let webview: vscode.Webview = this.webviewView.webview;
            const scriptUri = webview.asWebviewUri(
                vscode.Uri.joinPath(extensionUri, "media", "main.js"),
            );
            const stylesMainUri = webview.asWebviewUri(
                vscode.Uri.joinPath(extensionUri, "media", "main.css"),
            );

            const vendorHighlightCss = webview.asWebviewUri(
                vscode.Uri.joinPath(
                    extensionUri,
                    "media",
                    "vendor",
                    "highlight.min.css",
                ),
            );
            const vendorJqueryUICss = webview.asWebviewUri(
                vscode.Uri.joinPath(
                    extensionUri,
                    "media",
                    "vendor",
                    "hjquery-ui.css",
                ),
            );
            const vendorHighlightJs = webview.asWebviewUri(
                vscode.Uri.joinPath(
                    extensionUri,
                    "media",
                    "vendor",
                    "highlight.min.js",
                ),
            );
            const vendorJqueryUIMinJs = webview.asWebviewUri(
                vscode.Uri.joinPath(
                    extensionUri,
                    "media",
                    "vendor",
                    "jquery-ui.min.js",
                ),
            );
            const vendorJqueryJs = webview.asWebviewUri(
                vscode.Uri.joinPath(
                    extensionUri,
                    "media",
                    "vendor",
                    "jquery-3.5.1.min.js",
                ),
            );
            const vendorMarkedJs = webview.asWebviewUri(
                vscode.Uri.joinPath(
                    extensionUri,
                    "media",
                    "vendor",
                    "marked.min.js",
                ),
            );
            const vendorTailwindJs = webview.asWebviewUri(
                vscode.Uri.joinPath(
                    extensionUri,
                    "media",
                    "vendor",
                    "tailwindcss.3.2.4.min.js",
                ),
            );
            const vendorTurndownJs = webview.asWebviewUri(
                vscode.Uri.joinPath(
                    extensionUri,
                    "media",
                    "vendor",
                    "turndown.js",
                ),
            );

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
        } else {
            // raise an error here
            return '';
        }
    }
}