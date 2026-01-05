import { OAuthProvider, OAuthProviderType } from "../types";
import {
  geminiOAuthProvider,
  generatePKCEChallenge as geminiPKCE,
} from "./gemini";
import {
  claudeOAuthProvider,
  generatePKCEChallenge as claudePKCE,
} from "./claude";
import {
  chatgptOAuthProvider,
  generatePKCEChallenge as chatgptPKCE,
} from "./chatgpt";
import {
  antigravityOAuthProvider,
  generatePKCEChallenge as antigravityPKCE,
} from "./antigravity";

export { geminiOAuthProvider } from "./gemini";
export { claudeOAuthProvider } from "./claude";
export { chatgptOAuthProvider, extractAccountIdFromJWT } from "./chatgpt";
export { antigravityOAuthProvider } from "./antigravity";

export function getOAuthProvider(type: OAuthProviderType): OAuthProvider {
  switch (type) {
    case "gemini":
      return geminiOAuthProvider;
    case "claude":
      return claudeOAuthProvider;
    case "chatgpt":
      return chatgptOAuthProvider;
    case "antigravity":
      return antigravityOAuthProvider;
    default:
      throw new Error(`Unknown OAuth provider: ${type}`);
  }
}

export function generatePKCEChallenge(type: OAuthProviderType) {
  switch (type) {
    case "gemini":
      return geminiPKCE();
    case "claude":
      return claudePKCE();
    case "chatgpt":
      return chatgptPKCE();
    case "antigravity":
      return antigravityPKCE();
    default:
      throw new Error(`Unknown OAuth provider: ${type}`);
  }
}
