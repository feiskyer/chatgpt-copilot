/**
 * MCP Server Manager for VS Code Extension
 */
import { v4 as uuidv4 } from "uuid";
import * as vscode from "vscode";

export interface MCPServer {
  id: string;
  name: string;
  type: string;
  isEnabled: boolean;
  command?: string;
  url?: string;
  arguments?: string[];
  env?: Record<string, string>;
  tools?: string[];
}

export interface MCPServerStore {
  servers: MCPServer[];
  addServer: (server: MCPServer) => void;
  removeServer: (id: string) => void;
  updateServer: (id: string, updates: Partial<MCPServer>) => void;
  toggleServerEnabled: (id: string) => void;
}

export default class MCPServerProvider implements vscode.WebviewViewProvider {
  private webView?: vscode.WebviewView;
  private store: { servers: MCPServer[] } = { servers: [] };
  private _panel?: vscode.WebviewPanel;

  constructor(private context: vscode.ExtensionContext) {
    this.loadServers();
  }

  private loadServers() {
    this.store = this.context.globalState.get<{ servers: MCPServer[] }>(
      "mcpServers",
      { servers: [] },
    );
  }

  private saveServers() {
    this.context.globalState.update("mcpServers", this.store);
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
        case "addServer":
          this.addServer(data.server);
          break;
        case "updateServer":
          this.updateServer(data.server);
          break;
        case "deleteServer":
          this.deleteServer(data.id);
          break;
        case "toggleServerEnabled":
          this.toggleServerEnabled(data.id);
          break;
        case "getServers":
          this.handleGetServers(webviewView.webview);
          break;
      }
    });
  }

  public addServer(server: Omit<MCPServer, "id">) {
    const newServer: MCPServer = {
      id: uuidv4(),
      ...server,
    };
    this.store.servers.push(newServer);
    this.saveServers();
    this.sendServersToAll(this.store.servers);
  }

  public updateServer(server: MCPServer) {
    const index = this.store.servers.findIndex((s) => s.id === server.id);
    if (index !== -1) {
      this.store.servers[index] = {
        ...this.store.servers[index],
        ...server,
      };
      this.saveServers();
      this.sendServersToAll(this.store.servers);
    } else {
      console.error(`Server with id ${server.id} not found for update`);
    }
  }

  public deleteServer(id: string) {
    const initialLength = this.store.servers.length;
    this.store.servers = this.store.servers.filter((s) => s.id !== id);

    if (this.store.servers.length === initialLength) {
      console.error(`Server with id ${id} not found for deletion`);
      return;
    }

    this.saveServers();
    this.sendServersToAll(this.store.servers);
  }

  public toggleServerEnabled(id: string) {
    const index = this.store.servers.findIndex((s) => s.id === id);
    if (index !== -1) {
      this.store.servers[index].isEnabled =
        !this.store.servers[index].isEnabled;
      this.saveServers();
      this.sendServersToAll(this.store.servers);
    }
  }

  private sendServersToAll(servers: MCPServer[]) {
    this.webView?.webview.postMessage({
      type: "updateServers",
      servers: servers,
    });

    if (this._panel?.webview) {
      this._panel.webview.postMessage({
        type: "updateServers",
        servers: servers,
      });
    }
  }

  public getServers() {
    return this.store.servers;
  }

  public setPanel(panel: vscode.WebviewPanel | undefined) {
    this._panel = panel;
  }

  private handleGetServers(webview: vscode.Webview) {
    webview.postMessage({
      type: "updateServers",
      servers: this.store.servers,
    });
  }

  public getWebviewContent(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "mcp-servers.js"),
    );
    const stylesUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        "media",
        "mcp-servers.css",
      ),
    );
    const mcpIconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "mcp.svg"),
    );

    return `<!DOCTYPE html>
        <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${stylesUri}" rel="stylesheet">
            </head>
            <body>
                <div class="mcp-servers-container">
                    <header class="view-header">
                        <div class="title-container">
                            <img src="${mcpIconUri}" alt="MCP" class="title-icon">
                            <h2>MCP Servers</h2>
                        </div>
                        <button id="addServer" class="action-button">
                            <svg width="14" height="14" viewBox="0 0 16 16">
                                <path fill="currentColor" d="M14 7v1H8v6H7V8H1V7h6V1h1v6h6z"/>
                            </svg>
                            Add Server
                        </button>
                    </header>

                    <div class="info-panel">
                        <span class="info-icon">ℹ️</span>
                        <p>
                            Model Context Protocol offers external tools to AI Agents. You can learn more
                            <a href="https://modelcontextprotocol.io" class="learn-more-link">here</a>.
                        </p>
                    </div>

                    <div class="content-area">
                        <div id="serverList" class="server-list"></div>
                        <div id="empty-state" class="empty-state hidden">
                            <div class="empty-icon">
                                <svg width="48" height="48" viewBox="0 0 24 24">
                                    <path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z"/>
                                </svg>
                            </div>
                            <p>No servers configured yet</p>
                            <button id="addFirstServer" class="primary-action-button">Create your first MCP server</button>
                        </div>
                    </div>
                </div>
                <script src="${scriptUri}"></script>
            </body>
        </html>`;
  }
}
