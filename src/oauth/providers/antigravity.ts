/* eslint-disable @typescript-eslint/naming-convention */
import * as crypto from "crypto";
import {
  OAuthProvider,
  OAuthProviderConfig,
  OAuthToken,
  PKCEChallenge,
  TokenRefreshResult,
  UserInfo,
  OAuthModelInfo,
  OAUTH_CALLBACK_PORT,
} from "../types";

const CLIENT_ID =
  "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
const CLIENT_SECRET = "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";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v1/userinfo";
const SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/cclog",
  "https://www.googleapis.com/auth/experimentsandconfigs",
];

// Endpoint fallback order (daily → autopush → prod) - mirrors CLIProxy behavior
const ANTIGRAVITY_ENDPOINT_DAILY =
  "https://daily-cloudcode-pa.sandbox.googleapis.com";
const ANTIGRAVITY_ENDPOINT_AUTOPUSH =
  "https://autopush-cloudcode-pa.sandbox.googleapis.com";
const ANTIGRAVITY_ENDPOINT_PROD = "https://cloudcode-pa.googleapis.com";

// For loadCodeAssist, prod first is more reliable
const LOAD_CODE_ASSIST_ENDPOINTS = [
  `${ANTIGRAVITY_ENDPOINT_PROD}/v1internal:loadCodeAssist`,
  `${ANTIGRAVITY_ENDPOINT_DAILY}/v1internal:loadCodeAssist`,
  `${ANTIGRAVITY_ENDPOINT_AUTOPUSH}/v1internal:loadCodeAssist`,
];

export function generatePKCEChallenge(): PKCEChallenge {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  const state = crypto.randomBytes(16).toString("hex");
  return { verifier, challenge, state };
}

export const antigravityOAuthConfig: OAuthProviderConfig = {
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  authUrl: AUTH_URL,
  tokenEndpoint: TOKEN_ENDPOINT,
  redirectUri: `http://localhost:${OAUTH_CALLBACK_PORT}/oauth-callback`,
  scopes: SCOPES,
};

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
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body,
      });

      if (!response.ok) {
        continue;
      }

      const data = await response.json();
      // Check for project ID in different response formats
      if (typeof data.cloudaicompanionProject === "string") {
        return data.cloudaicompanionProject;
      }
      if (data.cloudaicompanionProject?.id) {
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

// Fetch available models API endpoint
const FETCH_MODELS_ENDPOINT = `${ANTIGRAVITY_ENDPOINT_PROD}/v1internal:fetchAvailableModels`;

interface AntigravityModelResponse {
  models?: Record<
    string,
    {
      displayName?: string;
      modelProvider?: string;
      isInternal?: boolean;
      quotaInfo?: {
        remainingFraction?: number;
        resetTime?: string;
      };
    }
  >;
}

/**
 * Fetch available models with quota information from Antigravity API.
 * Reference: koder_agent/auth/antigravity_quota.py
 */
export async function fetchAvailableModels(
  accessToken: string,
  projectId: string,
): Promise<OAuthModelInfo[]> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "User-Agent": "antigravity/1.11.5 Darwin/arm64",
  };

  const body = JSON.stringify({ project: projectId });

  try {
    const response = await fetch(FETCH_MODELS_ENDPOINT, {
      method: "POST",
      headers,
      body,
    });

    if (!response.ok) {
      console.error(
        `fetchAvailableModels failed: ${response.status} ${response.statusText}`,
      );
      return [];
    }

    const data: AntigravityModelResponse = await response.json();
    const models = data.models || {};
    const result: OAuthModelInfo[] = [];

    for (const [modelName, info] of Object.entries(models)) {
      // Skip internal models
      if (info.isInternal) {
        continue;
      }

      result.push({
        id: modelName,
        name: info.displayName || modelName,
        provider: info.modelProvider,
        supportsTools: true,
        supportsVision: true,
        quotaInfo: info.quotaInfo
          ? {
              remainingFraction: info.quotaInfo.remainingFraction ?? 1.0,
              resetTime: info.quotaInfo.resetTime,
            }
          : undefined,
      });
    }

    // Sort by provider then by name
    result.sort((a, b) => {
      const providerOrder: Record<string, number> = {
        GOOGLE: 0,
        ANTHROPIC: 1,
        OPENAI: 2,
      };
      const aOrder = providerOrder[a.provider || ""] ?? 3;
      const bOrder = providerOrder[b.provider || ""] ?? 3;
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      return a.name.localeCompare(b.name);
    });

    return result;
  } catch (error) {
    console.error("fetchAvailableModels error:", error);
    return [];
  }
}

export class AntigravityOAuthProvider implements OAuthProvider {
  readonly type = "antigravity" as const;
  readonly config = antigravityOAuthConfig;

  generateAuthUrl(challenge: PKCEChallenge): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: Array.isArray(this.config.scopes)
        ? this.config.scopes.join(" ")
        : this.config.scopes,
      code_challenge: challenge.challenge,
      code_challenge_method: "S256",
      state: challenge.state,
      access_type: "offline",
      prompt: "consent",
    });
    return `${this.config.authUrl}?${params.toString()}`;
  }

  async exchangeCode(code: string, verifier: string): Promise<OAuthToken> {
    const params: Record<string, string> = {
      client_id: this.config.clientId,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: this.config.redirectUri,
    };
    if (this.config.clientSecret) {
      params.client_secret = this.config.clientSecret;
    }

    const response = await fetch(this.config.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const data = await response.json();
    const userInfo = await this.getUserInfo(data.access_token);
    const projectId = await discoverProjectId(data.access_token);

    return {
      provider: "antigravity",
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      email: userInfo.email,
      projectId: projectId || undefined,
    };
  }

  async refreshToken(refreshToken: string): Promise<TokenRefreshResult> {
    const params: Record<string, string> = {
      client_id: this.config.clientId,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    };
    if (this.config.clientSecret) {
      params.client_secret = this.config.clientSecret;
    }

    const response = await fetch(this.config.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${error}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  async getUserInfo(accessToken: string): Promise<UserInfo> {
    const response = await fetch(USERINFO_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error("Failed to get user info");
    }

    const data = await response.json();
    return {
      email: data.email,
      name: data.name,
      picture: data.picture,
    };
  }
}

export const antigravityOAuthProvider = new AntigravityOAuthProvider();
