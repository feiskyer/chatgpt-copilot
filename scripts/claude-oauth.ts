#!/usr/bin/env npx ts-node

/**
 * Claude OAuth CLI - Authenticate and test Anthropic Claude models.
 *
 * Usage: npx ts-node scripts/claude-oauth.ts
 *
 * Note: Claude OAuth requires manual code entry - copy the authorization
 * code from the browser and paste it into the terminal.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as readline from "readline";
import { spawn } from "child_process";
import { URLSearchParams } from "url";

// OAuth Configuration
const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const AUTH_URL = "https://claude.ai/oauth/authorize";
const TOKEN_ENDPOINT = "https://console.anthropic.com/v1/oauth/token";
const REDIRECT_URI = "https://console.anthropic.com/oauth/code/callback";
const SCOPES = "org:create_api_key user:profile user:inference";

// Anthropic API
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1";
const ANTHROPIC_BETA_HEADERS =
  "oauth-2025-04-20,claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14";
const CLAUDE_CODE_SYSTEM_PREFIX =
  "You are Claude Code, Anthropic's official CLI for Claude.";

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

// Available Claude models
const CLAUDE_MODELS = [
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
  { id: "claude-3-7-sonnet-20250219", name: "Claude 3.7 Sonnet" },
  { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
  { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku" },
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
  return { verifier, challenge, state: verifier };
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
  return loadAllTokens()["claude"] || null;
}

function saveToken(token: OAuthToken): void {
  ensureTokenDir();
  const tokens = loadAllTokens();
  tokens["claude"] = { ...token, provider: "claude" };
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), {
    mode: 0o600,
  });
}

function isTokenValid(token: OAuthToken | null): boolean {
  if (!token) {return false;}
  return Date.now() < token.expiresAt - 5 * 60 * 1000;
}

async function refreshAccessToken(token: OAuthToken): Promise<OAuthToken> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
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
  const endpoint = `${ANTHROPIC_API_URL}/messages`;

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
    "anthropic-beta": ANTHROPIC_BETA_HEADERS,
  };

  const body = JSON.stringify({
    model: modelId,
    max_tokens: 20,
    system: [{ type: "text", text: CLAUDE_CODE_SYSTEM_PREFIX }],
    messages: [{ role: "user", content: "Say 'Hello' and nothing else." }],
  });

  try {
    const response = await fetch(endpoint, { method: "POST", headers, body });

    if (response.ok) {
      const data = await response.json();
      const text = data.content?.[0]?.text || "(no text)";
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

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function performOAuthFlow(): Promise<OAuthToken> {
  const challenge = generatePKCEChallenge();

  const params = new URLSearchParams({
    code: "true",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES,
    code_challenge: challenge.challenge,
    code_challenge_method: "S256",
    state: challenge.state,
  });

  const authUrl = `${AUTH_URL}?${params.toString()}`;

  console.log("\n   Opening browser for authentication...\n");
  console.log(
    `   ${colors.yellow}After authorizing, you will see an authorization code.${colors.reset}`,
  );
  console.log(
    `   ${colors.yellow}Copy the ENTIRE code (format: code#state) and paste below.${colors.reset}\n`,
  );

  openBrowser(authUrl);

  const code = await prompt("   Paste authorization code: ");

  if (!code) {
    throw new Error("No authorization code provided");
  }

  console.log("\n   Exchanging code for tokens...");

  const splits = code.split("#");
  const actualCode = splits[0];
  const state = splits[1] || "";

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: actualCode,
      state: state,
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code_verifier: challenge.verifier,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${await response.text()}`);
  }

  const tokenData = (await response.json()) as TokenResponse;

  const token: OAuthToken = {
    provider: "claude",
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || "",
    expiresAt: Date.now() + tokenData.expires_in * 1000,
  };

  saveToken(token);
  return token;
}

async function main() {
  console.log(
    `\n${colors.cyan}${colors.bold}Claude OAuth (Anthropic)${colors.reset}`,
  );
  console.log("─".repeat(50));

  // Step 1: Check token
  console.log(
    `\n${colors.bold}[1/3]${colors.reset} Checking authentication...`,
  );
  let token = loadToken();

  if (token) {
    console.log(`   Expires: ${new Date(token.expiresAt).toISOString()}`);

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
    console.log(`   ${colors.dim}(Manual code entry required)${colors.reset}`);
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
    oauth: { expiresAt: string };
    models: ModelResult[];
  } = {
    oauth: { expiresAt: new Date(token.expiresAt).toISOString() },
    models: [],
  };

  for (const model of CLAUDE_MODELS) {
    process.stdout.write(`   ${model.id.padEnd(30)} `);
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
    console.log("  • Account doesn't have Claude Max/Pro subscription");
    console.log("  • System prompt requirement not met");
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
