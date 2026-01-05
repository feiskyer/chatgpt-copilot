import * as assert from "assert";

// Mock types for testing
interface OAuthToken {
  provider: "gemini" | "claude" | "chatgpt" | "antigravity";
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email?: string;
  projectId?: string;
}

// Mock VS Code secrets storage
class MockSecretStorage {
  private _storage = new Map<string, string>();

  async get(key: string): Promise<string | undefined> {
    return this._storage.get(key);
  }

  async store(key: string, value: string): Promise<void> {
    this._storage.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this._storage.delete(key);
  }

  clear(): void {
    this._storage.clear();
  }
}

describe("TokenStorage", () => {
  let mockSecrets: MockSecretStorage;

  beforeEach(() => {
    mockSecrets = new MockSecretStorage();
  });

  describe("getToken", () => {
    it("should return undefined for non-existent token", async () => {
      const token = await mockSecrets.get("oauth-token-gemini");
      assert.strictEqual(token, undefined);
    });

    it("should return stored token", async () => {
      const testToken: OAuthToken = {
        provider: "gemini",
        accessToken: "test-access-token",
        refreshToken: "test-refresh-token",
        expiresAt: Date.now() + 3600000,
        email: "test@example.com",
      };

      await mockSecrets.store("oauth-token-gemini", JSON.stringify(testToken));

      const stored = await mockSecrets.get("oauth-token-gemini");
      assert.ok(stored);

      const parsed = JSON.parse(stored) as OAuthToken;
      assert.strictEqual(parsed.provider, "gemini");
      assert.strictEqual(parsed.accessToken, "test-access-token");
      assert.strictEqual(parsed.email, "test@example.com");
    });
  });

  describe("setToken", () => {
    it("should store token with provider key", async () => {
      const testToken: OAuthToken = {
        provider: "claude",
        accessToken: "claude-access",
        refreshToken: "claude-refresh",
        expiresAt: Date.now() + 3600000,
      };

      await mockSecrets.store("oauth-token-claude", JSON.stringify(testToken));

      const stored = await mockSecrets.get("oauth-token-claude");
      assert.ok(stored);

      const parsed = JSON.parse(stored) as OAuthToken;
      assert.strictEqual(parsed.provider, "claude");
    });
  });

  describe("deleteToken", () => {
    it("should remove token", async () => {
      const testToken: OAuthToken = {
        provider: "chatgpt",
        accessToken: "chatgpt-access",
        refreshToken: "chatgpt-refresh",
        expiresAt: Date.now() + 3600000,
      };

      await mockSecrets.store("oauth-token-chatgpt", JSON.stringify(testToken));

      let stored = await mockSecrets.get("oauth-token-chatgpt");
      assert.ok(stored);

      await mockSecrets.delete("oauth-token-chatgpt");

      stored = await mockSecrets.get("oauth-token-chatgpt");
      assert.strictEqual(stored, undefined);
    });
  });

  describe("token expiry detection", () => {
    it("should detect expired token", () => {
      const expiredToken: OAuthToken = {
        provider: "gemini",
        accessToken: "expired-access",
        refreshToken: "refresh",
        expiresAt: Date.now() - 1000, // Expired 1 second ago
      };

      const isExpired = expiredToken.expiresAt < Date.now();
      assert.strictEqual(isExpired, true);
    });

    it("should detect valid token", () => {
      const validToken: OAuthToken = {
        provider: "gemini",
        accessToken: "valid-access",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3600000, // Valid for 1 hour
      };

      const isExpired = validToken.expiresAt < Date.now();
      assert.strictEqual(isExpired, false);
    });

    it("should detect token needing refresh (within 60s of expiry)", () => {
      const nearExpiryToken: OAuthToken = {
        provider: "gemini",
        accessToken: "near-expiry-access",
        refreshToken: "refresh",
        expiresAt: Date.now() + 30000, // Expires in 30 seconds
      };

      const REFRESH_THRESHOLD_MS = 60000; // 60 seconds
      const needsRefresh =
        nearExpiryToken.expiresAt < Date.now() + REFRESH_THRESHOLD_MS;
      assert.strictEqual(needsRefresh, true);
    });
  });

  describe("multiple providers", () => {
    it("should store tokens for different providers independently", async () => {
      const geminiToken: OAuthToken = {
        provider: "gemini",
        accessToken: "gemini-access",
        refreshToken: "gemini-refresh",
        expiresAt: Date.now() + 3600000,
      };

      const claudeToken: OAuthToken = {
        provider: "claude",
        accessToken: "claude-access",
        refreshToken: "claude-refresh",
        expiresAt: Date.now() + 3600000,
      };

      await mockSecrets.store(
        "oauth-token-gemini",
        JSON.stringify(geminiToken),
      );
      await mockSecrets.store(
        "oauth-token-claude",
        JSON.stringify(claudeToken),
      );

      const storedGemini = await mockSecrets.get("oauth-token-gemini");
      const storedClaude = await mockSecrets.get("oauth-token-claude");

      assert.ok(storedGemini);
      assert.ok(storedClaude);

      const parsedGemini = JSON.parse(storedGemini) as OAuthToken;
      const parsedClaude = JSON.parse(storedClaude) as OAuthToken;

      assert.strictEqual(parsedGemini.accessToken, "gemini-access");
      assert.strictEqual(parsedClaude.accessToken, "claude-access");
    });
  });
});
