import {
  OAuthProvider,
  OAuthProviderType,
  PKCEChallenge,
  generatePKCEChallenge as generatePKCE,
} from "../types";
import { geminiOAuthProvider } from "./gemini";
import { claudeOAuthProvider } from "./claude";
import { chatgptOAuthProvider } from "./chatgpt";
import { antigravityOAuthProvider } from "./antigravity";

export { geminiOAuthProvider } from "./gemini";
export { claudeOAuthProvider } from "./claude";
export { chatgptOAuthProvider, extractAccountIdFromJWT } from "./chatgpt";
export { antigravityOAuthProvider } from "./antigravity";

const OAUTH_PROVIDERS: Record<OAuthProviderType, OAuthProvider> = {
  gemini: geminiOAuthProvider,
  claude: claudeOAuthProvider,
  chatgpt: chatgptOAuthProvider,
  antigravity: antigravityOAuthProvider,
};

export function getOAuthProvider(type: OAuthProviderType): OAuthProvider {
  const provider = OAUTH_PROVIDERS[type];
  if (!provider) {
    throw new Error(`Unknown OAuth provider: ${type}`);
  }
  return provider;
}

export function generatePKCEChallenge(type: OAuthProviderType): PKCEChallenge {
  // Claude uses verifier as state (per reference implementation)
  return generatePKCE(type === "claude");
}
