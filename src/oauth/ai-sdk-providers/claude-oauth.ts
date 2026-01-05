import { createAnthropic } from "@ai-sdk/anthropic";
import { OAuthToken } from "../types";
import { getValidToken, setToken } from "../token-storage";
import { claudeOAuthProvider } from "../providers/claude";
import {
  cleanToolSchemas,
  injectParameterSignatures,
  injectToolHardeningInstruction,
  CLAUDE_TOOL_SYSTEM_INSTRUCTION,
  filterUnsignedThinkingBlocks,
  buildSignatureSessionKey,
  cacheThinkingSignatures,
  extractThinkingFromClaudeResponse,
} from "../tool-utils";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1";
const ANTHROPIC_BETA_HEADERS =
  "oauth-2025-04-20,claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14";

const CLAUDE_CODE_SYSTEM_PREFIX =
  "You are Claude Code, Anthropic's official CLI for Claude.";

export interface ClaudeOAuthProviderOptions {
  sessionId?: string;
}

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  signature?: string;
}

interface ClaudeRequestBody {
  model?: string;
  system?: string | ContentBlock[];
  messages?: unknown[];
  tools?: unknown[];
  [key: string]: unknown;
}

async function refreshClaudeToken(refreshToken: string) {
  return claudeOAuthProvider.refreshToken(refreshToken);
}

function transformSystemToArray(
  system: string | ContentBlock[] | undefined,
): ContentBlock[] {
  if (!system) {
    return [{ type: "text", text: CLAUDE_CODE_SYSTEM_PREFIX }];
  }

  if (typeof system === "string") {
    return [
      { type: "text", text: CLAUDE_CODE_SYSTEM_PREFIX },
      { type: "text", text: system },
    ];
  }

  if (Array.isArray(system)) {
    const hasClaudeCodePrefix = system.some(
      (block) =>
        block.type === "text" && block.text?.includes("You are Claude Code"),
    );

    if (hasClaudeCodePrefix) {
      return system;
    }

    return [{ type: "text", text: CLAUDE_CODE_SYSTEM_PREFIX }, ...system];
  }

  return [{ type: "text", text: CLAUDE_CODE_SYSTEM_PREFIX }];
}

function createClaudeOAuthFetch(
  getToken: () => Promise<OAuthToken | null>,
  sessionId: string,
) {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const token = await getToken();
    if (!token) {
      throw new Error("Claude OAuth token not available. Please login first.");
    }

    const url = typeof input === "string" ? input : input.toString();

    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token.accessToken}`);
    headers.set("Content-Type", "application/json");
    headers.set("anthropic-version", "2023-06-01"); // Required API version header
    headers.set("anthropic-beta", ANTHROPIC_BETA_HEADERS);
    headers.delete("x-api-key");

    let body = init?.body;
    let modelName = "claude-sonnet-4-20250514";

    if (body && typeof body === "string") {
      try {
        const parsed: ClaudeRequestBody = JSON.parse(body);
        modelName = parsed.model || modelName;

        parsed.system = transformSystemToArray(parsed.system);

        if (parsed.tools && Array.isArray(parsed.tools)) {
          parsed.tools = cleanToolSchemas(parsed.tools);
          parsed.tools = injectParameterSignatures(parsed.tools);
          injectToolHardeningInstruction(
            parsed as Record<string, unknown>,
            CLAUDE_TOOL_SYSTEM_INSTRUCTION,
          );
        }

        const signatureSessionKey = buildSignatureSessionKey(
          sessionId,
          modelName,
        );
        const filteredPayload = filterUnsignedThinkingBlocks(
          parsed,
          signatureSessionKey,
          undefined,
        );

        body = JSON.stringify(filteredPayload);
      } catch {
        // Keep original body if parsing fails
      }
    }

    const response = await fetch(url, {
      ...init,
      headers,
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();

      if (errorText.includes("Only authorized for Claude Code")) {
        throw new Error(
          "Claude OAuth error: System prompt must identify as Claude Code. " +
            "This is a known requirement for OAuth tokens.",
        );
      }

      throw new Error(`Claude API error: ${response.status} - ${errorText}`);
    }

    if (response.body) {
      const contentType = response.headers.get("content-type") || "";
      const isStreaming = contentType.includes("text/event-stream");

      if (!isStreaming) {
        const text = await response.text();
        try {
          const data = JSON.parse(text);
          if (data.content && Array.isArray(data.content)) {
            const signatureSessionKey = buildSignatureSessionKey(
              sessionId,
              modelName,
            );
            const thinkingBlocks = extractThinkingFromClaudeResponse(
              data.content,
            );
            cacheThinkingSignatures(signatureSessionKey, thinkingBlocks);
          }
        } catch {
          // Ignore parse errors
        }
        return new Response(text, {
          headers: response.headers,
          status: response.status,
          statusText: response.statusText,
        });
      }
    }

    return response;
  };
}

export function createClaudeOAuthProvider(
  options: ClaudeOAuthProviderOptions = {},
) {
  const sessionId = options.sessionId || `claude-${Date.now()}`;

  const getToken = async (): Promise<OAuthToken | null> => {
    return getValidToken("claude", async (refreshToken) => {
      const result = await refreshClaudeToken(refreshToken);
      const currentToken = await getValidToken("claude");
      if (currentToken && result.refreshToken) {
        await setToken({
          ...currentToken,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresAt: Date.now() + result.expiresIn * 1000,
        });
      }
      return result;
    });
  };

  return {
    async createProvider() {
      const customFetch = createClaudeOAuthFetch(getToken, sessionId);

      return createAnthropic({
        baseURL: ANTHROPIC_API_URL,
        apiKey: "oauth",
        fetch: customFetch,
      });
    },

    async getModel(modelId: string) {
      const provider = await this.createProvider();
      return provider(modelId);
    },
  };
}

export type ClaudeOAuthAIProvider = ReturnType<
  typeof createClaudeOAuthProvider
>;
