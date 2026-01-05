/* eslint-disable @typescript-eslint/naming-convention */
import * as crypto from "crypto";
import {
  OAuthProvider,
  OAuthProviderConfig,
  OAuthToken,
  PKCEChallenge,
  TokenRefreshResult,
  UserInfo,
} from "../types";

const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
// Claude OAuth uses claude.ai for Max plan, console.anthropic.com for API key creation
const AUTH_URL_MAX = "https://claude.ai/oauth/authorize";
const AUTH_URL_CONSOLE = "https://console.anthropic.com/oauth/authorize";
const TOKEN_ENDPOINT = "https://console.anthropic.com/v1/oauth/token";
// Note: Claude OAuth redirects to Anthropic's own callback URL, not localhost
// User must manually copy the authorization code from that page
const REDIRECT_URI = "https://console.anthropic.com/oauth/code/callback";
const SCOPES = "org:create_api_key user:profile user:inference";

export function generatePKCEChallenge(): PKCEChallenge {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  // For Claude OAuth, we use verifier as state (reference implementation does this)
  return { verifier, challenge, state: verifier };
}

export const claudeOAuthConfig: OAuthProviderConfig = {
  clientId: CLIENT_ID,
  authUrl: AUTH_URL_MAX, // Default to Max plan (claude.ai)
  tokenEndpoint: TOKEN_ENDPOINT,
  redirectUri: REDIRECT_URI,
  scopes: SCOPES,
};

export class ClaudeOAuthProvider implements OAuthProvider {
  readonly type = "claude" as const;
  readonly config = claudeOAuthConfig;

  generateAuthUrl(challenge: PKCEChallenge): string {
    const params = new URLSearchParams({
      code: "true", // Required for Claude OAuth
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: Array.isArray(this.config.scopes)
        ? this.config.scopes.join(" ")
        : this.config.scopes,
      code_challenge: challenge.challenge,
      code_challenge_method: "S256",
      state: challenge.state,
    });
    return `${this.config.authUrl}?${params.toString()}`;
  }

  async exchangeCode(code: string, verifier: string): Promise<OAuthToken> {
    // Claude OAuth returns code in format "code#state"
    const splits = code.split("#");
    const actualCode = splits[0];
    const state = splits[1] || "";

    // Claude OAuth uses JSON body (not URL-encoded)
    const response = await fetch(this.config.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code: actualCode,
        state: state,
        grant_type: "authorization_code",
        client_id: this.config.clientId,
        redirect_uri: this.config.redirectUri,
        code_verifier: verifier,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const data = await response.json();

    return {
      provider: "claude",
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
  }

  async refreshToken(refreshToken: string): Promise<TokenRefreshResult> {
    const response = await fetch(this.config.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: this.config.clientId,
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
    // Claude OAuth doesn't provide a user info endpoint
    return {};
  }
}

export const claudeOAuthProvider = new ClaudeOAuthProvider();
