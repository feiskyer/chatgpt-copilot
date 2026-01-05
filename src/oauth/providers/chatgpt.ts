/* eslint-disable @typescript-eslint/naming-convention */
import * as crypto from "crypto";
import {
  OAuthProvider,
  OAuthProviderConfig,
  OAuthToken,
  PKCEChallenge,
  TokenRefreshResult,
  UserInfo,
  OAUTH_CALLBACK_PORTS,
  OAUTH_CALLBACK_PATHS,
} from "../types";

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTH_URL = "https://auth.openai.com/oauth/authorize";
const TOKEN_ENDPOINT = "https://auth.openai.com/oauth/token";
const SCOPES = "openid profile email offline_access";

export function generatePKCEChallenge(): PKCEChallenge {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  const state = crypto.randomBytes(16).toString("hex");
  return { verifier, challenge, state };
}

export const chatgptOAuthConfig: OAuthProviderConfig = {
  clientId: CLIENT_ID,
  authUrl: AUTH_URL,
  tokenEndpoint: TOKEN_ENDPOINT,
  redirectUri: `http://localhost:${OAUTH_CALLBACK_PORTS.chatgpt}${OAUTH_CALLBACK_PATHS.chatgpt}`,
  scopes: SCOPES,
};

export function extractAccountIdFromJWT(accessToken: string): string | null {
  try {
    const parts = accessToken.split(".");
    if (parts.length !== 3) {
      return null;
    }
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf-8"),
    );
    return payload["https://api.openai.com/auth"]?.chatgpt_account_id || null;
  } catch {
    return null;
  }
}

export class ChatGPTOAuthProvider implements OAuthProvider {
  readonly type = "chatgpt" as const;
  readonly config = chatgptOAuthConfig;

  generateAuthUrl(challenge: PKCEChallenge): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: Array.isArray(this.config.scopes)
        ? this.config.scopes.join(" ")
        : this.config.scopes,
      code_challenge: challenge.challenge,
      code_challenge_method: "S256",
      state: challenge.state,
      // ChatGPT/Codex-specific params
      id_token_add_organizations: "true",
      codex_cli_simplified_flow: "true",
      originator: "codex_cli_rs",
    });
    return `${this.config.authUrl}?${params.toString()}`;
  }

  async exchangeCode(code: string, verifier: string): Promise<OAuthToken> {
    const response = await fetch(this.config.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: this.config.redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const data = await response.json();

    return {
      provider: "chatgpt",
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
  }

  async refreshToken(refreshToken: string): Promise<TokenRefreshResult> {
    const response = await fetch(this.config.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
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

  async getUserInfo(_accessToken: string): Promise<UserInfo> {
    return {};
  }
}

export const chatgptOAuthProvider = new ChatGPTOAuthProvider();
