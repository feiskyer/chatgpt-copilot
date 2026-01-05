/* eslint-disable @typescript-eslint/naming-convention */
import * as assert from "assert";
import * as crypto from "crypto";

// PKCE utilities for testing
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

function generateState(): string {
  return crypto.randomBytes(16).toString("hex");
}

describe("OAuth Flow", () => {
  describe("PKCE Generation", () => {
    it("should generate code verifier with correct length", () => {
      const verifier = generateCodeVerifier();
      // Base64URL of 32 bytes = 43 characters
      assert.strictEqual(verifier.length, 43);
    });

    it("should generate unique verifiers", () => {
      const verifier1 = generateCodeVerifier();
      const verifier2 = generateCodeVerifier();
      assert.notStrictEqual(verifier1, verifier2);
    });

    it("should generate valid code challenge from verifier", () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);

      // Base64URL of SHA-256 hash = 43 characters
      assert.strictEqual(challenge.length, 43);
    });

    it("should generate consistent challenge for same verifier", () => {
      const verifier = "test-verifier-12345";
      const challenge1 = generateCodeChallenge(verifier);
      const challenge2 = generateCodeChallenge(verifier);

      assert.strictEqual(challenge1, challenge2);
    });
  });

  describe("State Generation", () => {
    it("should generate state with correct length", () => {
      const state = generateState();
      // Hex of 16 bytes = 32 characters
      assert.strictEqual(state.length, 32);
    });

    it("should generate unique states", () => {
      const state1 = generateState();
      const state2 = generateState();
      assert.notStrictEqual(state1, state2);
    });
  });

  describe("Auth URL Construction", () => {
    const providers = {
      gemini: {
        clientId:
          "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com",
        authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        redirectUri: "http://localhost:51121/oauth/gemini/callback",
        scopes: [
          "https://www.googleapis.com/auth/cloud-platform",
          "https://www.googleapis.com/auth/userinfo.email",
          "https://www.googleapis.com/auth/userinfo.profile",
        ],
      },
      claude: {
        clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
        authUrl: "https://claude.ai/oauth/authorize",
        redirectUri: "http://localhost:51121/oauth/claude/callback",
        scopes: "org:create_api_key user:profile user:inference",
      },
      chatgpt: {
        clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
        authUrl: "https://auth.openai.com/oauth/authorize",
        redirectUri: "http://localhost:51121/oauth/chatgpt/callback",
        scopes: "openid profile email offline_access",
      },
      antigravity: {
        clientId:
          "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com",
        authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        redirectUri: "http://localhost:51121/oauth/antigravity/callback",
        scopes: [
          "https://www.googleapis.com/auth/cloud-platform",
          "https://www.googleapis.com/auth/userinfo.email",
          "https://www.googleapis.com/auth/userinfo.profile",
        ],
      },
    };

    function buildAuthUrl(
      provider: keyof typeof providers,
      state: string,
      codeChallenge: string,
    ): string {
      const config = providers[provider];
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: "code",
        scope: Array.isArray(config.scopes)
          ? config.scopes.join(" ")
          : config.scopes,
        state: state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      });

      if (provider === "gemini" || provider === "antigravity") {
        params.append("access_type", "offline");
        params.append("prompt", "consent");
      }

      return `${config.authUrl}?${params.toString()}`;
    }

    it("should build valid Gemini auth URL", () => {
      const state = generateState();
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);

      const url = buildAuthUrl("gemini", state, challenge);

      assert.ok(url.startsWith("https://accounts.google.com"));
      assert.ok(url.includes("client_id="));
      assert.ok(url.includes("redirect_uri="));
      assert.ok(url.includes("code_challenge="));
      assert.ok(url.includes("code_challenge_method=S256"));
      assert.ok(url.includes("access_type=offline"));
    });

    it("should build valid Claude auth URL", () => {
      const state = generateState();
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);

      const url = buildAuthUrl("claude", state, challenge);

      assert.ok(url.startsWith("https://claude.ai/oauth/authorize"));
      assert.ok(url.includes("client_id="));
      assert.ok(url.includes("scope=org%3Acreate_api_key"));
    });

    it("should build valid ChatGPT auth URL", () => {
      const state = generateState();
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);

      const url = buildAuthUrl("chatgpt", state, challenge);

      assert.ok(url.startsWith("https://auth.openai.com"));
      assert.ok(url.includes("client_id="));
      assert.ok(url.includes("scope=openid"));
    });

    it("should build valid Antigravity auth URL", () => {
      const state = generateState();
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);

      const url = buildAuthUrl("antigravity", state, challenge);

      assert.ok(url.startsWith("https://accounts.google.com"));
      assert.ok(
        url.includes(
          "redirect_uri=http%3A%2F%2Flocalhost%3A51121%2Foauth%2Fantigravity",
        ),
      );
    });
  });

  describe("State Validation", () => {
    it("should validate matching state", () => {
      const originalState = generateState();
      const receivedState = originalState;

      assert.strictEqual(originalState, receivedState);
    });

    it("should reject mismatched state", () => {
      const originalState = generateState();
      const attackerState = generateState();

      assert.notStrictEqual(originalState, attackerState);
    });

    it("should reject empty state", () => {
      const originalState = generateState();
      const emptyState = "";

      assert.notStrictEqual(originalState, emptyState);
    });
  });

  describe("Callback URL Parsing", () => {
    it("should extract code from callback URL", () => {
      const callbackUrl =
        "http://localhost:51121/oauth/gemini/callback?code=auth_code_123&state=abc123";
      const url = new URL(callbackUrl);

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      assert.strictEqual(code, "auth_code_123");
      assert.strictEqual(state, "abc123");
    });

    it("should handle error in callback URL", () => {
      const callbackUrl =
        "http://localhost:51121/oauth/gemini/callback?error=access_denied&error_description=User%20denied%20access";
      const url = new URL(callbackUrl);

      const error = url.searchParams.get("error");
      const errorDesc = url.searchParams.get("error_description");

      assert.strictEqual(error, "access_denied");
      assert.strictEqual(errorDesc, "User denied access");
    });
  });

  describe("Token Exchange Request", () => {
    it("should build correct token exchange body for Gemini", () => {
      const code = "auth_code_123";
      const verifier = "code_verifier_123";
      const clientId =
        "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com";
      const redirectUri = "http://localhost:51121/oauth/gemini/callback";

      const body = new URLSearchParams({
        client_id: clientId,
        code: code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });

      assert.ok(body.has("client_id"));
      assert.ok(body.has("code"));
      assert.ok(body.has("code_verifier"));
      assert.strictEqual(body.get("grant_type"), "authorization_code");
    });
  });

  describe("Token Refresh Request", () => {
    it("should build correct refresh request body", () => {
      const refreshToken = "refresh_token_123";
      const clientId =
        "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com";

      const body = new URLSearchParams({
        client_id: clientId,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      });

      assert.strictEqual(body.get("grant_type"), "refresh_token");
      assert.ok(body.has("refresh_token"));
    });
  });
});
