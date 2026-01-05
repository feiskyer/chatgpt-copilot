#!/usr/bin/env npx ts-node

/**
 * Gemini OAuth CLI - Authenticate and test Google Gemini models via Code Assist.
 *
 * Usage: npx ts-node scripts/gemini-oauth.ts
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
  "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com";
const CLIENT_SECRET = "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";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v1/userinfo";
const OAUTH_CALLBACK_PORT = 8085;
const REDIRECT_URI = `http://localhost:${OAUTH_CALLBACK_PORT}/oauth2callback`;

const SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

// Gemini Code Assist API
const GEMINI_CODE_ASSIST_ENDPOINT = "https://cloudcode-pa.googleapis.com";

const CODE_ASSIST_HEADERS = {
  "User-Agent": "cloud-code-gemini-vscode/2.0.0 GPN:cloud-code-gemini;",
  "X-Goog-Api-Client": "cloud-code-gemini-vscode/2.0.0",
  "Client-Metadata": JSON.stringify({
    clientName: "chatgpt-copilot",
    clientVersion: "1.0.0",
    os: "unknown",
    ideType: "vscode",
    ideVersion: "1.96.0",
    clientId: `oauth-test-${Date.now()}`,
  }),
};

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

// Available Gemini models
const GEMINI_MODELS = [
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
  { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash" },
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
  return loadAllTokens()["gemini"] || null;
}

function saveToken(token: OAuthToken): void {
  ensureTokenDir();
  const tokens = loadAllTokens();
  tokens["gemini"] = { ...token, provider: "gemini" };
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
  const response = await fetch(`${USERINFO_ENDPOINT}?alt=json`, {
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
    ...CODE_ASSIST_HEADERS,
  };

  const body = JSON.stringify({
    metadata: {
      ideType: "IDE_UNSPECIFIED",
      platform: "PLATFORM_UNSPECIFIED",
      pluginType: "GEMINI",
    },
  });

  const endpoint = `${GEMINI_CODE_ASSIST_ENDPOINT}/v1internal:loadCodeAssist`;

  try {
    const response = await fetch(endpoint, { method: "POST", headers, body });
    if (!response.ok) {return null;}

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
    // Ignore errors
  }

  return null;
}

async function testModelEndpoint(
  accessToken: string,
  projectId: string,
  modelId: string,
): Promise<{ success: boolean; response?: string; error?: string }> {
  const endpoint = `${GEMINI_CODE_ASSIST_ENDPOINT}/v1internal:streamGenerateContent?alt=sse`;

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    ...CODE_ASSIST_HEADERS,
  };

  const body = JSON.stringify({
    project: projectId,
    model: modelId,
    request: {
      contents: [
        { role: "user", parts: [{ text: "Say 'Hello' and nothing else." }] },
      ],
      generationConfig: { maxOutputTokens: 10 },
    },
  });

  try {
    const response = await fetch(endpoint, { method: "POST", headers, body });

    if (response.ok) {
      const text = await response.text();
      const lines = text.split("\n").filter((l) => l.startsWith("data: "));
      let responseText = "";

      for (const line of lines.slice(0, 3)) {
        try {
          const data = JSON.parse(line.slice(6));
          const unwrapped = data.response || data;
          if (unwrapped.candidates?.[0]?.content?.parts?.[0]?.text) {
            responseText += unwrapped.candidates[0].content.parts[0].text;
          }
        } catch {
          // Ignore parse errors
        }
      }

      return { success: true, response: responseText || "(streaming ok)" };
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

      if (url.pathname !== "/oauth2callback") {
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
          provider: "gemini",
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

async function main() {
  console.log(
    `\n${colors.cyan}${colors.bold}Gemini OAuth (Google Code Assist)${colors.reset}`,
  );
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

  // Step 4: Test models
  console.log(
    `\n${colors.bold}[4/4]${colors.reset} Testing available models...`,
  );

  interface ModelResult {
    id: string;
    name: string;
    status: string;
    response?: string;
    error?: string;
  }

  const results: {
    oauth: { email?: string; projectId?: string; expiresAt: string };
    models: ModelResult[];
  } = {
    oauth: {
      email: token.email,
      projectId: token.projectId,
      expiresAt: new Date(token.expiresAt).toISOString(),
    },
    models: [],
  };

  for (const model of GEMINI_MODELS) {
    process.stdout.write(`   ${model.id.padEnd(20)} `);
    const result = await testModelEndpoint(
      token.accessToken,
      token.projectId!,
      model.id,
    );

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
    console.log("  • Project ID is incorrect");
    console.log("  • Account doesn't have Cloud Code Assist access");
    console.log("  • Model names have changed");
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
