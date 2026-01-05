import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { OAuthProviderType, OAuthToken } from "./types";

const TOKEN_KEY_PREFIX = "oauth-token-";
const TOKEN_REFRESH_THRESHOLD_MS = 60 * 1000;

// Shared file storage location for CLI script access
const SHARED_TOKEN_DIR = path.join(os.homedir(), ".chatgpt-copilot");
const SHARED_TOKEN_FILE = path.join(SHARED_TOKEN_DIR, "oauth-tokens.json");

let secretStorage: vscode.SecretStorage | null = null;

export function initializeTokenStorage(context: vscode.ExtensionContext): void {
  secretStorage = context.secrets;
  // Ensure shared token directory exists
  ensureSharedTokenDir();
}

function ensureSharedTokenDir(): void {
  try {
    if (!fs.existsSync(SHARED_TOKEN_DIR)) {
      fs.mkdirSync(SHARED_TOKEN_DIR, { recursive: true, mode: 0o700 });
    }
  } catch (err) {
    console.error("Failed to create shared token directory:", err);
  }
}

interface SharedTokens {
  [provider: string]: OAuthToken;
}

function loadSharedTokens(): SharedTokens {
  try {
    if (fs.existsSync(SHARED_TOKEN_FILE)) {
      const data = fs.readFileSync(SHARED_TOKEN_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Failed to load shared tokens:", err);
  }
  return {};
}

function saveSharedTokens(tokens: SharedTokens): void {
  try {
    ensureSharedTokenDir();
    fs.writeFileSync(SHARED_TOKEN_FILE, JSON.stringify(tokens, null, 2), {
      mode: 0o600,
    });
  } catch (err) {
    console.error("Failed to save shared tokens:", err);
  }
}

function updateSharedToken(token: OAuthToken): void {
  const tokens = loadSharedTokens();
  tokens[token.provider] = token;
  saveSharedTokens(tokens);
}

function removeSharedToken(provider: OAuthProviderType): void {
  const tokens = loadSharedTokens();
  delete tokens[provider];
  saveSharedTokens(tokens);
}

export function getSharedTokenFilePath(): string {
  return SHARED_TOKEN_FILE;
}

function getSecretStorage(): vscode.SecretStorage {
  if (!secretStorage) {
    throw new Error(
      "Token storage not initialized. Call initializeTokenStorage first.",
    );
  }
  return secretStorage;
}

function getTokenKey(provider: OAuthProviderType): string {
  return `${TOKEN_KEY_PREFIX}${provider}`;
}

export async function getToken(
  provider: OAuthProviderType,
): Promise<OAuthToken | null> {
  const storage = getSecretStorage();
  const key = getTokenKey(provider);
  const data = await storage.get(key);

  if (!data) {
    return null;
  }

  try {
    return JSON.parse(data) as OAuthToken;
  } catch {
    return null;
  }
}

export async function setToken(token: OAuthToken): Promise<void> {
  const storage = getSecretStorage();
  const key = getTokenKey(token.provider);
  await storage.store(key, JSON.stringify(token));
  // Also sync to shared file for CLI script access
  updateSharedToken(token);
}

export async function deleteToken(provider: OAuthProviderType): Promise<void> {
  const storage = getSecretStorage();
  const key = getTokenKey(provider);
  await storage.delete(key);
  // Also remove from shared file
  removeSharedToken(provider);
}

export async function getAllTokens(): Promise<OAuthToken[]> {
  const providers: OAuthProviderType[] = [
    "gemini",
    "claude",
    "chatgpt",
    "antigravity",
  ];
  const tokens: OAuthToken[] = [];

  for (const provider of providers) {
    const token = await getToken(provider);
    if (token) {
      tokens.push(token);
    }
  }

  return tokens;
}

export function isTokenExpired(token: OAuthToken): boolean {
  return Date.now() >= token.expiresAt;
}

export function isTokenNearExpiry(token: OAuthToken): boolean {
  return Date.now() >= token.expiresAt - TOKEN_REFRESH_THRESHOLD_MS;
}

export async function getValidToken(
  provider: OAuthProviderType,
  refreshFn?: (refreshToken: string) => Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
  }>,
): Promise<OAuthToken | null> {
  const token = await getToken(provider);

  if (!token) {
    return null;
  }

  if (!isTokenNearExpiry(token)) {
    return token;
  }

  if (!refreshFn) {
    if (isTokenExpired(token)) {
      return null;
    }
    return token;
  }

  try {
    const refreshResult = await refreshFn(token.refreshToken);
    const updatedToken: OAuthToken = {
      ...token,
      accessToken: refreshResult.accessToken,
      refreshToken: refreshResult.refreshToken || token.refreshToken,
      expiresAt: Date.now() + refreshResult.expiresIn * 1000,
    };
    await setToken(updatedToken);
    return updatedToken;
  } catch (error) {
    console.error(`Failed to refresh ${provider} token:`, error);
    if (isTokenExpired(token)) {
      return null;
    }
    return token;
  }
}

export async function hasValidToken(
  provider: OAuthProviderType,
): Promise<boolean> {
  const token = await getToken(provider);
  return token !== null && !isTokenExpired(token);
}

export async function clearAllTokens(): Promise<void> {
  const providers: OAuthProviderType[] = [
    "gemini",
    "claude",
    "chatgpt",
    "antigravity",
  ];
  for (const provider of providers) {
    await deleteToken(provider);
  }
}
