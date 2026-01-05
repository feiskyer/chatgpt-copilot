#!/usr/bin/env npx ts-node

/**
 * Antigravity OAuth CLI - Authenticate and list available models with quota info.
 *
 * Usage: npx ts-node scripts/antigravity-oauth.ts
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as http from "http";
import * as os from "os";
import * as path from "path";
import { spawn } from "child_process";
import { URL, URLSearchParams } from "url";

// OAuth Configuration
const CLIENT_ID =
  "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
const CLIENT_SECRET = "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";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v1/userinfo";
const OAUTH_CALLBACK_PORT = 51121;
const REDIRECT_URI = `http://localhost:${OAUTH_CALLBACK_PORT}/oauth-callback`;

const SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/cclog",
  "https://www.googleapis.com/auth/experimentsandconfigs",
];

const LOAD_CODE_ASSIST_ENDPOINTS = [
  "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
  "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:loadCodeAssist",
  "https://autopush-cloudcode-pa.sandbox.googleapis.com/v1internal:loadCodeAssist",
];

const FETCH_MODELS_ENDPOINT =
  "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels";

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

interface UserInfoResponse {
  email: string;
  name?: string;
}

interface LoadCodeAssistResponse {
  cloudaicompanionProject?: string | { id: string };
  projectId?: string;
}

interface ModelInfo {
  displayName?: string;
  modelProvider?: string;
  isInternal?: boolean;
  quotaInfo?: { remainingFraction?: number; resetTime?: string };
}

interface FetchModelsResponse {
  models?: Record<string, ModelInfo>;
}

interface ModelEntry {
  name: string;
  display: string;
  remaining?: number;
  reset?: string;
}

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
  return loadAllTokens()["antigravity"] || null;
}

function saveToken(token: OAuthToken): void {
  ensureTokenDir();
  const tokens = loadAllTokens();
  tokens["antigravity"] = { ...token, provider: "antigravity" };
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
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: token.refreshToken,
      grant_type: "refresh_token",
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

async function getUserInfo(accessToken: string): Promise<UserInfoResponse> {
  const response = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error("Failed to get user info");
  }

  return response.json() as Promise<UserInfoResponse>;
}

async function discoverProjectId(accessToken: string): Promise<string | null> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "User-Agent": "google-api-nodejs-client/9.15.1",
    "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
    "Client-Metadata":
      "ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI",
  };

  const body = JSON.stringify({
    metadata: {
      ideType: "IDE_UNSPECIFIED",
      platform: "PLATFORM_UNSPECIFIED",
      pluginType: "GEMINI",
    },
  });

  for (const endpoint of LOAD_CODE_ASSIST_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, { method: "POST", headers, body });
      if (!response.ok) {continue;}

      const data = (await response.json()) as LoadCodeAssistResponse;

      if (typeof data.cloudaicompanionProject === "string") {
        return data.cloudaicompanionProject;
      }
      if (
        typeof data.cloudaicompanionProject === "object" &&
        data.cloudaicompanionProject?.id
      ) {
        return data.cloudaicompanionProject.id;
      }
      if (data.projectId) {
        return data.projectId;
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function fetchAvailableModels(
  accessToken: string,
  projectId: string,
): Promise<FetchModelsResponse> {
  const response = await fetch(FETCH_MODELS_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": "antigravity/1.11.5 Darwin/arm64",
    },
    body: JSON.stringify({ project: projectId }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch models: ${response.status} - ${await response.text()}`,
    );
  }

  return response.json() as Promise<FetchModelsResponse>;
}

function renderQuotaBar(fraction: number): string {
  const pct = Math.round(fraction * 100);
  const filled = Math.floor(pct / 10);
  const bar = "█".repeat(filled) + "░".repeat(10 - filled);

  let color: string;
  if (pct >= 80) {
    color = colors.green;
  } else if (pct >= 30) {
    color = colors.yellow;
  } else {
    color = colors.red;
  }

  return `${color}[${bar}]${colors.reset} ${pct}%`;
}

function formatResetTime(resetTime?: string): string {
  if (!resetTime) {return "N/A";}
  if (resetTime.includes("T")) {
    return resetTime.split("T")[1]?.replace("Z", " UTC") || resetTime;
  }
  return resetTime;
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
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES.join(" "),
    code_challenge: challenge.challenge,
    code_challenge_method: "S256",
    state: challenge.state,
    access_type: "offline",
    prompt: "consent",
  });

  const authUrl = `${AUTH_URL}?${params.toString()}`;

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(
        req.url || "/",
        `http://localhost:${OAUTH_CALLBACK_PORT}`,
      );

      if (url.pathname !== "/oauth-callback") {
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
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            code,
            code_verifier: challenge.verifier,
            grant_type: "authorization_code",
            redirect_uri: REDIRECT_URI,
          }),
        });

        if (!tokenResponse.ok) {
          throw new Error(
            `Token exchange failed: ${await tokenResponse.text()}`,
          );
        }

        const tokenData = (await tokenResponse.json()) as TokenResponse;
        const userInfo = await getUserInfo(tokenData.access_token);
        const projectId = await discoverProjectId(tokenData.access_token);

        const token: OAuthToken = {
          provider: "antigravity",
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || "",
          expiresAt: Date.now() + tokenData.expires_in * 1000,
          email: userInfo.email,
          projectId: projectId || undefined,
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

function printModelGroup(title: string, models: ModelEntry[]): void {
  if (models.length === 0) {return;}

  console.log(`\n${colors.bold}${title}${colors.reset}`);
  for (const m of models.sort((a, b) => a.name.localeCompare(b.name))) {
    if (m.remaining !== undefined) {
      const bar = renderQuotaBar(m.remaining);
      const reset = formatResetTime(m.reset);
      console.log(
        `  ${m.display.padEnd(35)} ${bar}  ${colors.dim}reset: ${reset}${colors.reset}`,
      );
    } else {
      console.log(
        `  ${m.display.padEnd(35)} ${colors.dim}(no quota info)${colors.reset}`,
      );
    }
  }
}

async function main() {
  console.log(`\n${colors.cyan}${colors.bold}Antigravity OAuth${colors.reset}`);
  console.log("─".repeat(50));

  // Step 1: Check token
  console.log(
    `\n${colors.bold}[1/4]${colors.reset} Checking authentication...`,
  );
  let token = loadToken();

  if (token) {
    console.log(`   Email: ${token.email || "unknown"}`);
    console.log(`   Project: ${token.projectId || "not discovered"}`);
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
    console.log(`\n${colors.bold}[2/4]${colors.reset} Starting OAuth flow...`);
    try {
      token = await performOAuthFlow();
      console.log(
        `   ${colors.green}✓ Authenticated as ${token.email}${colors.reset}`,
      );
    } catch (err) {
      console.error(`\n${colors.red}OAuth failed:${colors.reset}`, err);
      process.exit(1);
    }
  } else {
    console.log(
      `\n${colors.bold}[2/4]${colors.reset} Already authenticated, skipping...`,
    );
  }

  // Step 3: Discover project ID
  if (!token.projectId) {
    console.log(
      `\n${colors.bold}[3/4]${colors.reset} Discovering project ID...`,
    );
    const projectId = await discoverProjectId(token.accessToken);
    if (projectId) {
      token.projectId = projectId;
      saveToken(token);
      console.log(`   ${colors.green}✓ Project: ${projectId}${colors.reset}`);
    } else {
      console.log("   Could not discover project ID, using 'default'");
      token.projectId = "default";
    }
  } else {
    console.log(
      `\n${colors.bold}[3/4]${colors.reset} Project: ${token.projectId}`,
    );
  }

  // Step 4: Fetch models
  console.log(
    `\n${colors.bold}[4/4]${colors.reset} Fetching available models...`,
  );

  try {
    const modelsData = await fetchAvailableModels(
      token.accessToken,
      token.projectId!,
    );

    const models = modelsData.models || {};
    if (Object.keys(models).length === 0) {
      console.log(
        `\n   ${colors.yellow}No models returned from API${colors.reset}`,
      );
      return;
    }

    const googleModels: ModelEntry[] = [];
    const anthropicModels: ModelEntry[] = [];
    const openaiModels: ModelEntry[] = [];
    const otherModels: ModelEntry[] = [];

    for (const [modelName, info] of Object.entries(models)) {
      if (info.isInternal) {continue;}

      const entry: ModelEntry = {
        name: modelName,
        display: info.displayName || modelName,
        remaining: info.quotaInfo?.remainingFraction,
        reset: info.quotaInfo?.resetTime,
      };

      const provider = info.modelProvider || "";
      if (provider.includes("GOOGLE")) {
        googleModels.push(entry);
      } else if (provider.includes("ANTHROPIC")) {
        anthropicModels.push(entry);
      } else if (provider.includes("OPENAI")) {
        openaiModels.push(entry);
      } else {
        otherModels.push(entry);
      }
    }

    printModelGroup("Google Models", googleModels);
    printModelGroup("Anthropic Models", anthropicModels);
    printModelGroup("OpenAI Models", openaiModels);
    printModelGroup("Other Models", otherModels);

    const total =
      googleModels.length +
      anthropicModels.length +
      openaiModels.length +
      otherModels.length;

    console.log(
      `\n${colors.dim}Total: ${total} models available${colors.reset}`,
    );

    // JSON output
    console.log("\n" + "─".repeat(50));
    console.log(`${colors.bold}JSON Output${colors.reset}`);
    console.log("─".repeat(50));
    console.log(
      JSON.stringify(
        {
          oauth: {
            email: token.email,
            projectId: token.projectId,
            expiresAt: new Date(token.expiresAt).toISOString(),
          },
          models: {
            google: googleModels,
            anthropic: anthropicModels,
            openai: openaiModels,
            other: otherModels,
          },
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      `\n${colors.red}Failed to fetch models:${colors.reset}`,
      error,
    );
    console.log("\nPossible causes:");
    console.log("  • Project ID is incorrect");
    console.log("  • Account doesn't have Antigravity access");
    console.log("  • API endpoint has changed");
  }
}

main().catch((err) => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, err);
  process.exit(1);
});
