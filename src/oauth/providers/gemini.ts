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

const CLIENT_ID =
  "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com";
const CLIENT_SECRET = "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";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v1/userinfo"; // v1 endpoint like Python
const SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
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

export const geminiOAuthConfig: OAuthProviderConfig = {
  clientId: CLIENT_ID,
  authUrl: AUTH_URL,
  tokenEndpoint: TOKEN_ENDPOINT,
  redirectUri: `http://localhost:${OAUTH_CALLBACK_PORTS.gemini}${OAUTH_CALLBACK_PATHS.gemini}`,
  scopes: SCOPES,
};

export class GeminiOAuthProvider implements OAuthProvider {
  readonly type = "gemini" as const;
  readonly config = geminiOAuthConfig;

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
    const response = await fetch(this.config.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: CLIENT_SECRET,
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
    const userInfo = await this.getUserInfo(data.access_token);

    return {
      provider: "gemini",
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      email: userInfo.email,
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
        client_secret: CLIENT_SECRET,
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

export const geminiOAuthProvider = new GeminiOAuthProvider();
