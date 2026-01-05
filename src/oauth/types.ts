export type OAuthProviderType = "gemini" | "claude" | "chatgpt" | "antigravity";

export interface OAuthToken {
  provider: OAuthProviderType;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email?: string;
  projectId?: string;
}

export interface PKCEChallenge {
  verifier: string;
  challenge: string;
  state: string;
}

export interface OAuthCallbackResult {
  success: boolean;
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
}

export interface OAuthProviderConfig {
  clientId: string;
  clientSecret?: string;
  authUrl: string;
  tokenEndpoint: string;
  redirectUri: string;
  scopes: string | string[];
}

export interface TokenRefreshResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

export interface UserInfo {
  email?: string;
  name?: string;
  picture?: string;
}

export interface OAuthProvider {
  readonly type: OAuthProviderType;
  readonly config: OAuthProviderConfig;
  generateAuthUrl(challenge: PKCEChallenge): string;
  exchangeCode(code: string, verifier: string): Promise<OAuthToken>;
  refreshToken(refreshToken: string): Promise<TokenRefreshResult>;
  getUserInfo?(accessToken: string): Promise<UserInfo>;
}

export interface ModelQuotaInfo {
  remainingFraction: number; // 0.0 to 1.0
  resetTime?: string; // ISO timestamp
}

export interface OAuthModelInfo {
  id: string;
  name: string;
  description?: string;
  contextWindow?: number;
  supportsTools?: boolean;
  supportsVision?: boolean;
  provider?: "GOOGLE" | "ANTHROPIC" | "OPENAI" | string;
  quotaInfo?: ModelQuotaInfo;
}

// Default callback port (used by Antigravity)
export const OAUTH_CALLBACK_PORT = 51121;

// Provider-specific callback ports (each OAuth client has a registered redirect URI)
// Note: Claude uses manual code entry (redirect to Anthropic's page), not localhost callback
export const OAUTH_CALLBACK_PORTS: Record<OAuthProviderType, number> = {
  gemini: 8085, // Google OAuth uses port 8085
  claude: 0, // Claude: NO localhost callback - uses manual code entry
  chatgpt: 1455, // OpenAI uses port 1455
  antigravity: 51121, // Antigravity uses port 51121
};

// Provider-specific callback paths
// Note: Claude redirects to https://console.anthropic.com/oauth/code/callback (not localhost)
export const OAUTH_CALLBACK_PATHS: Record<OAuthProviderType, string> = {
  gemini: "/oauth2callback", // Google registered path
  claude: "", // Claude: NO localhost callback - user copies code manually
  chatgpt: "/auth/callback", // OpenAI registered path
  antigravity: "/oauth-callback", // Antigravity registered path
};

export const OAUTH_PROVIDER_DISPLAY_NAMES: Record<OAuthProviderType, string> = {
  gemini: "Gemini (Google OAuth)",
  claude: "Claude (Anthropic OAuth)",
  chatgpt: "ChatGPT (OpenAI OAuth)",
  antigravity: "Antigravity (Google OAuth)",
};

export const OAUTH_MODEL_PREFIXES: Record<OAuthProviderType, string> = {
  gemini: "gemini-cli/",
  claude: "claude-max/",
  chatgpt: "chatgpt/",
  antigravity: "antigravity/",
};
