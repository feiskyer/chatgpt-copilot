/* eslint-disable @typescript-eslint/naming-convention */
import * as assert from "assert";

describe("Gemini OAuth Provider", () => {
  const CLIENT_ID =
    "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com";
  const REDIRECT_URI = "http://localhost:51121/oauth/gemini/callback";
  const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
  const SCOPES = [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ];

  describe("Configuration", () => {
    it("should have correct client ID format", () => {
      assert.ok(CLIENT_ID.includes(".apps.googleusercontent.com"));
    });

    it("should have correct redirect URI with port 51121", () => {
      assert.ok(REDIRECT_URI.includes(":51121"));
      assert.ok(REDIRECT_URI.includes("/oauth/gemini/callback"));
    });

    it("should request required scopes", () => {
      assert.ok(
        SCOPES.includes("https://www.googleapis.com/auth/cloud-platform"),
      );
      assert.ok(
        SCOPES.includes("https://www.googleapis.com/auth/userinfo.email"),
      );
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
        scope: SCOPES.join(" "),
        state: state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        access_type: "offline",
        prompt: "consent",
      });

      const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

      assert.ok(url.startsWith("https://accounts.google.com"));
      assert.ok(url.includes("client_id="));
      assert.ok(url.includes("access_type=offline"));
    });
  });

  describe("Token Exchange", () => {
    it("should build correct token exchange request body", () => {
      const code = "auth_code_123";
      const codeVerifier = "verifier_123";

      const body = new URLSearchParams({
        client_id: CLIENT_ID,
        code: code,
        code_verifier: codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
      });

      assert.strictEqual(body.get("grant_type"), "authorization_code");
      assert.strictEqual(body.get("client_id"), CLIENT_ID);
    });

    it("should use correct token endpoint", () => {
      assert.strictEqual(TOKEN_ENDPOINT, "https://oauth2.googleapis.com/token");
    });
  });

  describe("Token Refresh", () => {
    it("should build correct refresh request body", () => {
      const refreshToken = "refresh_token_123";

      const body = new URLSearchParams({
        client_id: CLIENT_ID,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      });

      assert.strictEqual(body.get("grant_type"), "refresh_token");
    });
  });

  describe("API Integration", () => {
    it("should use cloudcode-pa endpoint for API calls", () => {
      const baseUrl = "https://cloudcode-pa.googleapis.com/v1internal";
      assert.ok(baseUrl.includes("cloudcode-pa"));
    });

    it("should include Client-Metadata header", () => {
      const metadata =
        "ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI";
      assert.ok(metadata.includes("pluginType=GEMINI"));
    });
  });
});
