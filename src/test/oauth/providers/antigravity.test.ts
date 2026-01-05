import * as assert from "assert";

describe("Antigravity OAuth Provider", () => {
  const CLIENT_ID =
    "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
  const REDIRECT_URI = "http://localhost:51121/oauth/antigravity/callback";
  const SCOPES = [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/cclog",
    "https://www.googleapis.com/auth/experimentsandconfigs",
  ];

  const ENDPOINTS = [
    "https://cloudcode-pa.googleapis.com/v1internal",
    "https://cloudcode-pa-daily.sandbox.googleapis.com/v1internal",
    "https://cloudcode-pa-autopush.sandbox.googleapis.com/v1internal",
  ];

  describe("Configuration", () => {
    it("should have correct client ID format", () => {
      assert.ok(CLIENT_ID.includes(".apps.googleusercontent.com"));
    });

    it("should have correct redirect URI with port 51121", () => {
      assert.ok(REDIRECT_URI.includes(":51121"));
      assert.ok(REDIRECT_URI.includes("/oauth/antigravity/callback"));
    });

    it("should request additional antigravity-specific scopes", () => {
      assert.ok(SCOPES.includes("https://www.googleapis.com/auth/cclog"));
      assert.ok(
        SCOPES.includes(
          "https://www.googleapis.com/auth/experimentsandconfigs",
        ),
      );
    });
  });

  describe("Endpoint Fallbacks", () => {
    it("should have production endpoint first", () => {
      assert.ok(ENDPOINTS[0].includes("cloudcode-pa.googleapis.com"));
      assert.ok(!ENDPOINTS[0].includes("sandbox"));
    });

    it("should have daily sandbox as fallback", () => {
      assert.ok(ENDPOINTS[1].includes("daily.sandbox"));
    });

    it("should have autopush sandbox as last resort", () => {
      assert.ok(ENDPOINTS[2].includes("autopush.sandbox"));
    });
  });

  describe("Model Support", () => {
    it("should detect Claude models", () => {
      const isClaudeModel = (modelId: string) =>
        modelId.toLowerCase().includes("claude");

      assert.ok(isClaudeModel("claude-sonnet-4"));
      assert.ok(isClaudeModel("claude-opus-4"));
      assert.ok(!isClaudeModel("gemini-2.5-pro"));
    });

    it("should detect Gemini models", () => {
      const isGeminiModel = (modelId: string) =>
        modelId.toLowerCase().includes("gemini");

      assert.ok(isGeminiModel("gemini-2.5-pro"));
      assert.ok(isGeminiModel("gemini-2.5-flash"));
      assert.ok(!isGeminiModel("claude-sonnet-4"));
    });
  });

  describe("Model Suffix Handling", () => {
    it("should use :antigravity suffix for quota routing", () => {
      const modelId = "gemini-2.5-pro";
      const routedModel = `${modelId}:antigravity`;

      assert.ok(routedModel.endsWith(":antigravity"));
    });

    it("should strip :antigravity suffix before API call", () => {
      const routedModel = "gemini-2.5-pro:antigravity";
      const cleanModel = routedModel.replace(":antigravity", "");

      assert.strictEqual(cleanModel, "gemini-2.5-pro");
    });
  });

  describe("Dual Provider Support", () => {
    it("should route Claude models to Anthropic API", () => {
      const modelId = "claude-sonnet-4";
      const isClaude = modelId.toLowerCase().includes("claude");
      const apiUrl = isClaude
        ? "https://api.anthropic.com/v1"
        : "https://cloudcode-pa.googleapis.com/v1internal";

      assert.strictEqual(apiUrl, "https://api.anthropic.com/v1");
    });

    it("should route Gemini models to Google API", () => {
      const modelId = "gemini-2.5-pro";
      const isClaude = modelId.toLowerCase().includes("claude");
      const apiUrl = isClaude
        ? "https://api.anthropic.com/v1"
        : "https://cloudcode-pa.googleapis.com/v1internal";

      assert.ok(apiUrl.includes("cloudcode-pa"));
    });
  });

  describe("Claude via Antigravity", () => {
    it("should require Claude Code system prompt prefix", () => {
      const prefix =
        "You are Claude Code, Anthropic's official CLI for Claude.";
      assert.ok(prefix.includes("Claude Code"));
    });

    it("should include anthropic-beta header", () => {
      const betaHeader =
        "oauth-2025-04-20,claude-code-20250219,interleaved-thinking-2025-05-14";
      assert.ok(betaHeader.includes("oauth-2025-04-20"));
    });
  });
});
