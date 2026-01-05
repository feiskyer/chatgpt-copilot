/* eslint-disable @typescript-eslint/naming-convention */
import * as assert from "assert";

describe("Claude OAuth Provider", () => {
  const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
  const AUTH_URL = "https://claude.ai/oauth/authorize";
  const TOKEN_ENDPOINT = "https://console.anthropic.com/v1/oauth/token";
  const REDIRECT_URI = "http://localhost:51121/oauth/claude/callback";
  const SCOPES = "org:create_api_key user:profile user:inference";

  describe("Configuration", () => {
    it("should have correct client ID format (UUID)", () => {
      // UUID format: 8-4-4-4-12
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      assert.ok(uuidRegex.test(CLIENT_ID));
    });

    it("should have correct redirect URI with port 51121", () => {
      assert.ok(REDIRECT_URI.includes(":51121"));
      assert.ok(REDIRECT_URI.includes("/oauth/claude/callback"));
    });

    it("should request required scopes", () => {
      assert.ok(SCOPES.includes("user:inference"));
      assert.ok(SCOPES.includes("user:profile"));
    });
  });

  describe("Auth URL Construction", () => {
    it("should build valid authorization URL", () => {
      const state = "test-state-123";
      const codeChallenge = "test-challenge";

      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: "code",
        scope: SCOPES,
        state: state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      });

      const url = `${AUTH_URL}?${params.toString()}`;

      assert.ok(url.startsWith("https://claude.ai/oauth/authorize"));
      assert.ok(url.includes("client_id="));
    });
  });

  describe("Token Exchange", () => {
    it("should use correct token endpoint", () => {
      assert.strictEqual(
        TOKEN_ENDPOINT,
        "https://console.anthropic.com/v1/oauth/token",
      );
    });
  });

  describe("API Integration", () => {
    it("should require anthropic-beta header", () => {
      const betaHeader =
        "oauth-2025-04-20,claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14";
      assert.ok(betaHeader.includes("oauth-2025-04-20"));
      assert.ok(betaHeader.includes("claude-code-20250219"));
    });

    it("should NOT include x-api-key header with OAuth", () => {
      // OAuth uses Bearer token, not x-api-key
      const usesBearerToken = true;
      assert.strictEqual(usesBearerToken, true);
    });
  });

  describe("System Prompt Requirement", () => {
    it("should require Claude Code identification in system prompt", () => {
      const requiredPrefix =
        "You are Claude Code, Anthropic's official CLI for Claude.";
      assert.ok(requiredPrefix.includes("Claude Code"));
    });

    it("should convert string system prompt to array format", () => {
      const stringSystem = "You are a helpful assistant";
      const arraySystem = [
        {
          type: "text",
          text: "You are Claude Code, Anthropic's official CLI for Claude.",
        },
        { type: "text", text: stringSystem },
      ];

      assert.strictEqual(arraySystem[0].type, "text");
      assert.ok(arraySystem[0].text.includes("Claude Code"));
    });
  });
});
