/* eslint-disable @typescript-eslint/naming-convention */
import * as http from "http";
import { URL } from "url";
import {
  OAuthCallbackResult,
  OAuthProviderType,
  OAUTH_CALLBACK_PORTS,
  OAUTH_CALLBACK_PATHS,
} from "./types";

const TIMEOUT_MS = 5 * 60 * 1000;

interface PendingAuth {
  state: string;
  provider: OAuthProviderType;
  resolve: (result: OAuthCallbackResult) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  port: number;
}

// Map of port -> server for provider-specific callback servers
const servers = new Map<number, http.Server>();
const pendingAuths = new Map<string, PendingAuth>();

// Schedule server stop for a specific port when no pending auths remain for it
function scheduleServerStop(port: number): void {
  // Give a short delay to ensure the HTTP response is sent before closing
  setTimeout(() => {
    // Check if any pending auths use this port
    const hasPendingOnPort = Array.from(pendingAuths.values()).some(
      (auth) => auth.port === port,
    );

    if (!hasPendingOnPort) {
      const server = servers.get(port);
      if (server) {
        console.log(
          `OAuth callback server stopping on port ${port} (no pending auths)`,
        );
        server.close();
        servers.delete(port);
      }
    }
  }, 1000);
}

function getSuccessHtml(provider: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Authentication Successful</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
    .container { text-align: center; background: white; padding: 40px 60px; border-radius: 16px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); }
    h1 { color: #22c55e; margin-bottom: 16px; }
    p { color: #666; margin-bottom: 24px; }
    .icon { font-size: 64px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">✓</div>
    <h1>Authentication Successful</h1>
    <p>You have successfully signed in to ${provider}.</p>
    <p>You can close this window and return to VS Code.</p>
  </div>
</body>
</html>`;
}

function getErrorHtml(error: string, description?: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Authentication Failed</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: linear-gradient(135deg, #f87171 0%, #dc2626 100%); }
    .container { text-align: center; background: white; padding: 40px 60px; border-radius: 16px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); }
    h1 { color: #dc2626; margin-bottom: 16px; }
    p { color: #666; margin-bottom: 8px; }
    .error { color: #dc2626; font-family: monospace; background: #fef2f2; padding: 8px 16px; border-radius: 8px; margin-top: 16px; }
    .icon { font-size: 64px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">✕</div>
    <h1>Authentication Failed</h1>
    <p>An error occurred during authentication.</p>
    <div class="error">${error}${description ? `: ${description}` : ""}</div>
    <p style="margin-top: 24px;">Please close this window and try again in VS Code.</p>
  </div>
</body>
</html>`;
}

function extractProviderFromPath(
  path: string,
  port: number,
): OAuthProviderType | null {
  // Match paths based on provider-specific callback paths
  for (const [provider, expectedPath] of Object.entries(OAUTH_CALLBACK_PATHS)) {
    const expectedPort = OAUTH_CALLBACK_PORTS[provider as OAuthProviderType];
    if (
      port === expectedPort &&
      (path === expectedPath || path.startsWith(`${expectedPath}?`))
    ) {
      return provider as OAuthProviderType;
    }
  }

  // Fallback: Handle /oauth/{provider}/callback for legacy format
  const match = path.match(
    /^\/oauth\/(gemini|claude|chatgpt|antigravity)\/callback/,
  );
  return match ? (match[1] as OAuthProviderType) : null;
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  port: number,
): Promise<void> {
  const url = new URL(req.url || "/", `http://localhost:${port}`);
  const provider = extractProviderFromPath(url.pathname, port);

  if (!provider) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
    return;
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    const pendingAuth = state ? pendingAuths.get(state) : null;
    if (pendingAuth) {
      clearTimeout(pendingAuth.timeout);
      pendingAuths.delete(state!);
      pendingAuth.resolve({
        success: false,
        error,
        errorDescription: errorDescription || undefined,
      });
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(getErrorHtml(error, errorDescription || undefined));
    scheduleServerStop(port);
    return;
  }

  if (!code || !state) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(
      getErrorHtml(
        "Missing parameters",
        "Authorization code or state is missing",
      ),
    );
    return;
  }

  const pendingAuth = pendingAuths.get(state);
  if (!pendingAuth) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(
      getErrorHtml(
        "Invalid state",
        "The authentication request has expired or is invalid",
      ),
    );
    return;
  }

  if (pendingAuth.provider !== provider) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(
      getErrorHtml(
        "Provider mismatch",
        "The callback was received for a different provider",
      ),
    );
    return;
  }

  clearTimeout(pendingAuth.timeout);
  pendingAuths.delete(state);

  pendingAuth.resolve({
    success: true,
    code,
    state,
  });

  const providerNames: Record<OAuthProviderType, string> = {
    gemini: "Gemini",
    claude: "Claude",
    chatgpt: "ChatGPT",
    antigravity: "Antigravity",
  };

  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(getSuccessHtml(providerNames[provider]));
  scheduleServerStop(port);
}

async function ensureServerRunning(port: number): Promise<void> {
  if (servers.has(port)) {
    return;
  }

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      handleRequest(req, res, port).catch((err) => {
        console.error("OAuth callback handler error:", err);
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal Server Error");
      });
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(
          new Error(
            `Port ${port} is already in use. Please close any application using this port and try again.`,
          ),
        );
      } else {
        reject(err);
      }
    });

    server.listen(port, "127.0.0.1", () => {
      console.log(`OAuth callback server listening on port ${port}`);
      servers.set(port, server);
      resolve();
    });
  });
}

export async function waitForCallback(
  provider: OAuthProviderType,
  state: string,
): Promise<OAuthCallbackResult> {
  const port = OAUTH_CALLBACK_PORTS[provider];
  await ensureServerRunning(port);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingAuths.delete(state);
      reject(new Error("OAuth authentication timed out. Please try again."));
      scheduleServerStop(port);
    }, TIMEOUT_MS);

    pendingAuths.set(state, {
      state,
      provider,
      resolve,
      reject,
      timeout,
      port,
    });
  });
}

export function cancelPendingAuth(state: string): void {
  const pendingAuth = pendingAuths.get(state);
  if (pendingAuth) {
    clearTimeout(pendingAuth.timeout);
    const port = pendingAuth.port;
    pendingAuths.delete(state);
    pendingAuth.reject(new Error("Authentication cancelled"));
    scheduleServerStop(port);
  }
}

export function stopServer(): void {
  // Stop all servers
  for (const [state, pendingAuth] of pendingAuths) {
    clearTimeout(pendingAuth.timeout);
    pendingAuth.reject(new Error("Server stopped"));
    pendingAuths.delete(state);
  }

  for (const [port, server] of servers) {
    server.close();
    servers.delete(port);
  }
}

export function getCallbackUrl(provider: OAuthProviderType): string {
  const port = OAUTH_CALLBACK_PORTS[provider];
  const path = OAUTH_CALLBACK_PATHS[provider];
  return `http://localhost:${port}${path}`;
}

/**
 * Check if a provider uses manual code entry instead of localhost callback.
 * Claude OAuth redirects to Anthropic's page where user must manually copy the code.
 */
export function usesManualCodeEntry(provider: OAuthProviderType): boolean {
  // Claude doesn't use localhost callback - user must copy code from Anthropic's page
  return provider === "claude";
}

/**
 * Parse manual code entry for Claude OAuth.
 * Claude returns code in format "code#state" which needs to be split.
 */
export function parseManualCode(code: string): { code: string; state: string } {
  // Claude OAuth returns code in format "code#state"
  const parts = code.split("#");
  return {
    code: parts[0],
    state: parts[1] || "",
  };
}
