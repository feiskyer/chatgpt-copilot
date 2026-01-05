#!/usr/bin/env npx ts-node

/**
 * ChatGPT OAuth CLI - Authenticate and test OpenAI Codex models.
 *
 * Usage: npx ts-node scripts/chatgpt-oauth.ts
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as http from "http";
import * as os from "os";
import * as path from "path";
import { spawn } from "child_process";
import { URL, URLSearchParams } from "url";

// OAuth Configuration
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTH_URL = "https://auth.openai.com/oauth/authorize";
const TOKEN_ENDPOINT = "https://auth.openai.com/oauth/token";
const OAUTH_CALLBACK_PORT = 1455;
const REDIRECT_URI = `http://localhost:${OAUTH_CALLBACK_PORT}/auth/callback`;
const SCOPES = "openid profile email offline_access";

// ChatGPT backend API
const CHATGPT_BASE_URL = "https://chatgpt.com/backend-api";

// Token storage
const TOKEN_DIR = path.join(os.homedir(), ".chatgpt-copilot");
const TOKEN_FILE = path.join(TOKEN_DIR, "oauth-tokens.json");

interface OAuthToken {
  provider: "antigravity" | "gemini" | "claude" | "chatgpt";
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email?: string;
  projectId?: string;
}

interface PKCEChallenge {
  verifier: string;
  challenge: string;
  state: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

// Available ChatGPT/Codex models
const CHATGPT_MODELS = [
  { id: "gpt-5.2-codex", name: "GPT-5.2 Codex" },
  { id: "gpt-5.1-codex", name: "GPT-5.1 Codex" },
  { id: "gpt-5.0-codex", name: "GPT-5.0 Codex" },
  { id: "o3", name: "o3" },
  { id: "o3-mini", name: "o3-mini" },
  { id: "o4-mini", name: "o4-mini" },
];

// Terminal colors
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[92m",
  yellow: "\x1b[93m",
  red: "\x1b[91m",
  cyan: "\x1b[96m",
};

function generatePKCEChallenge(): PKCEChallenge {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  const state = crypto.randomBytes(16).toString("hex");
  return { verifier, challenge, state };
}

function ensureTokenDir(): void {
  if (!fs.existsSync(TOKEN_DIR)) {
    fs.mkdirSync(TOKEN_DIR, { recursive: true, mode: 0o700 });
  }
}

function loadAllTokens(): Record<string, OAuthToken> {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf-8"));
    }
  } catch {
    // Token file corrupted or missing
  }
  return {};
}

function loadToken(): OAuthToken | null {
  return loadAllTokens()["chatgpt"] || null;
}

function saveToken(token: OAuthToken): void {
  ensureTokenDir();
  const tokens = loadAllTokens();
  tokens["chatgpt"] = { ...token, provider: "chatgpt" };
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), {
    mode: 0o600,
  });
}

function isTokenValid(token: OAuthToken | null): boolean {
  if (!token) {return false;}
  return Date.now() < token.expiresAt - 5 * 60 * 1000;
}

function extractAccountIdFromJWT(accessToken: string): string | null {
  try {
    const parts = accessToken.split(".");
    if (parts.length !== 3) {return null;}
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf-8"),
    );
    return payload["https://api.openai.com/auth"]?.chatgpt_account_id || null;
  } catch {
    return null;
  }
}

async function refreshAccessToken(token: OAuthToken): Promise<OAuthToken> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: token.refreshToken,
      client_id: CLIENT_ID,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${await response.text()}`);
  }

  const data = (await response.json()) as TokenResponse;
  const newToken: OAuthToken = {
    ...token,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || token.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  saveToken(newToken);
  return newToken;
}

async function testModelEndpoint(
  accessToken: string,
  modelId: string,
): Promise<{ success: boolean; response?: string; error?: string }> {
  const endpoint = `${CHATGPT_BASE_URL}/codex/responses`;
  const accountId = extractAccountIdFromJWT(accessToken);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    originator: "codex_cli_rs",
    "OpenAI-Beta": "responses=experimental",
  };

  if (accountId) {
    headers["chatgpt-account-id"] = accountId;
  }

  const body = JSON.stringify({
    model: modelId,
    input: [{ role: "user", content: "Say 'Hello' and nothing else." }],
    max_output_tokens: 20,
    instructions:
      "You are a coding assistant. Help users with their coding questions.",
    store: false,
    stream: false,
    include: ["reasoning.encrypted_content"],
    text: { verbosity: "medium" },
  });

  try {
    const response = await fetch(endpoint, { method: "POST", headers, body });

    if (response.ok) {
      const data = await response.json();
      const text =
        data.output?.[0]?.content?.[0]?.text ||
        data.choices?.[0]?.message?.content ||
        "(no text)";
      return { success: true, response: text };
    }

    const errorText = await response.text();
    return {
      success: false,
      error: `${response.status}: ${errorText.slice(0, 200)}`,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function openBrowser(url: string): void {
  let command: string;
  let args: string[];

  if (process.platform === "darwin") {
    command = "open";
    args = [url];
  } else if (process.platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", url];
  } else {
    command = "xdg-open";
    args = [url];
  }

  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.on("error", () => {
    console.log("\nPlease open this URL manually:");
    console.log(url);
  });
  child.unref();
}

async function performOAuthFlow(): Promise<OAuthToken> {
  const challenge = generatePKCEChallenge();

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge: challenge.challenge,
    code_challenge_method: "S256",
    state: challenge.state,
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    originator: "codex_cli_rs",
  });

  const authUrl = `${AUTH_URL}?${params.toString()}`;

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(
        req.url || "/",
        `http://localhost:${OAUTH_CALLBACK_PORT}`,
      );

      if (url.pathname !== "/auth/callback") {
        res.writeHead(404);
        res.end("Not Found");
        return;
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(400);
        res.end(`Error: ${error}`);
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (!code || state !== challenge.state) {
        res.writeHead(400);
        res.end("Invalid callback");
        server.close();
        reject(new Error("Invalid OAuth callback"));
        return;
      }

      try {
        const tokenResponse = await fetch(TOKEN_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: CLIENT_ID,
            code,
            code_verifier: challenge.verifier,
            redirect_uri: REDIRECT_URI,
          }),
        });

        if (!tokenResponse.ok) {
          throw new Error(
            `Token exchange failed: ${await tokenResponse.text()}`,
          );
        }

        const tokenData = (await tokenResponse.json()) as TokenResponse;

        const token: OAuthToken = {
          provider: "chatgpt",
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || "",
          expiresAt: Date.now() + tokenData.expires_in * 1000,
        };

        saveToken(token);

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <html>
          <body style="font-family: system-ui, sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #22c55e;">✓ Authentication Successful</h1>
            <p>You can close this window and return to the terminal.</p>
          </body>
          </html>
        `);

        server.close();
        resolve(token);
      } catch (err) {
        res.writeHead(500);
        res.end(`Error: ${err}`);
        server.close();
        reject(err);
      }
    });

    server.listen(OAUTH_CALLBACK_PORT, "127.0.0.1", () => {
      console.log(`   Callback server started on port ${OAUTH_CALLBACK_PORT}`);
      console.log("   Opening browser...\n");
      openBrowser(authUrl);
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(new Error(`Port ${OAUTH_CALLBACK_PORT} is already in use`));
      } else {
        reject(err);
      }
    });
  });
}

async function main() {
  console.log(
    `\n${colors.cyan}${colors.bold}ChatGPT OAuth (OpenAI Codex)${colors.reset}`,
  );
  console.log("─".repeat(50));

  // Step 1: Check token
  console.log(
    `\n${colors.bold}[1/3]${colors.reset} Checking authentication...`,
  );
  let token = loadToken();

  if (token) {
    console.log(`   Expires: ${new Date(token.expiresAt).toISOString()}`);
    const accountId = extractAccountIdFromJWT(token.accessToken);
    if (accountId) {
      console.log(`   Account: ${accountId}`);
    }

    if (!isTokenValid(token)) {
      console.log("   Token expired, refreshing...");
      try {
        token = await refreshAccessToken(token);
        console.log(`   ${colors.green}✓ Token refreshed${colors.reset}`);
      } catch {
        console.log("   Token refresh failed, re-authenticating...");
        token = null;
      }
    } else {
      console.log(`   ${colors.green}✓ Token valid${colors.reset}`);
    }
  } else {
    console.log("   No token found");
  }

  // Step 2: OAuth flow if needed
  if (!token) {
    console.log(`\n${colors.bold}[2/3]${colors.reset} Starting OAuth flow...`);
    try {
      token = await performOAuthFlow();
      console.log(
        `   ${colors.green}✓ Authentication successful${colors.reset}`,
      );
    } catch (err) {
      console.error(`\n${colors.red}OAuth failed:${colors.reset}`, err);
      process.exit(1);
    }
  } else {
    console.log(
      `\n${colors.bold}[2/3]${colors.reset} Already authenticated, skipping...`,
    );
  }

  // Step 3: Test models
  console.log(
    `\n${colors.bold}[3/3]${colors.reset} Testing available models...`,
  );

  interface ModelResult {
    id: string;
    name: string;
    status: string;
    response?: string;
    error?: string;
  }

  const results: {
    oauth: { expiresAt: string; accountId: string | null };
    models: ModelResult[];
  } = {
    oauth: {
      expiresAt: new Date(token.expiresAt).toISOString(),
      accountId: extractAccountIdFromJWT(token.accessToken),
    },
    models: [],
  };

  for (const model of CHATGPT_MODELS) {
    process.stdout.write(`   ${model.id.padEnd(20)} `);
    const result = await testModelEndpoint(token.accessToken, model.id);

    if (result.success) {
      console.log(
        `${colors.green}✓${colors.reset} ${result.response?.slice(0, 30) || ""}`,
      );
      results.models.push({
        id: model.id,
        name: model.name,
        status: "ok",
        response: result.response,
      });
    } else {
      console.log(
        `${colors.red}✗${colors.reset} ${result.error?.slice(0, 40)}`,
      );
      results.models.push({
        id: model.id,
        name: model.name,
        status: "failed",
        error: result.error,
      });
    }
  }

  // Summary
  const okModels = results.models.filter((m) => m.status === "ok").length;
  const totalModels = results.models.length;

  console.log("\n" + "─".repeat(50));
  console.log(`${colors.bold}Summary${colors.reset}`);
  console.log("─".repeat(50));
  console.log(`   Models working: ${okModels}/${totalModels}`);

  if (okModels === 0) {
    console.log(`\n${colors.yellow}No models are working.${colors.reset}`);
    console.log("Possible causes:");
    console.log("  • OAuth token is invalid");
    console.log("  • Account doesn't have ChatGPT Plus/Pro subscription");
    console.log("  • Codex API access not enabled");
  }

  // JSON output
  console.log("\n" + "─".repeat(50));
  console.log(`${colors.bold}JSON Output${colors.reset}`);
  console.log("─".repeat(50));
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, err);
  process.exit(1);
});
