/* eslint-disable @typescript-eslint/naming-convention */
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { OAuthToken, OAuthModelInfo } from "../types";
import { getValidToken, setToken } from "../token-storage";
import {
  antigravityOAuthProvider,
  fetchAvailableModels,
} from "../providers/antigravity";
import {
  cleanToolSchemas,
  processToolCallPairing,
  buildSignatureSessionKey,
  cacheThinkingSignaturesFromChunk,
  injectParameterSignatures,
  injectToolHardeningInstruction,
  CLAUDE_TOOL_SYSTEM_INSTRUCTION,
  filterUnsignedThinkingBlocks,
  cacheThinkingSignatures,
  extractThinkingFromClaudeResponse,
} from "../tool-utils";

// Endpoint fallback order (daily → autopush → prod) - mirrors CLIProxy/Vibeproxy behavior
const ANTIGRAVITY_ENDPOINTS = [
  "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal",
  "https://autopush-cloudcode-pa.sandbox.googleapis.com/v1internal",
  "https://cloudcode-pa.googleapis.com/v1internal",
];

const ANTIGRAVITY_HEADERS = {
  "User-Agent": "antigravity/1.11.5 windows/amd64",
  "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
  "Client-Metadata":
    '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}',
};

const CLIENT_METADATA =
  "ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI";
const CLAUDE_CODE_SYSTEM_PREFIX =
  "You are Claude Code, Anthropic's official CLI for Claude.";

export interface AntigravityOAuthProviderOptions {
  projectId?: string;
  sessionId?: string;
}

interface RequestBody {
  model?: string;
  contents?: unknown[];
  messages?: unknown[];
  system?: string | unknown[];
  tools?: unknown[];
  [key: string]: unknown;
}

async function refreshAntigravityToken(refreshToken: string) {
  return antigravityOAuthProvider.refreshToken(refreshToken);
}

function isClaudeModel(modelId: string): boolean {
  return modelId.toLowerCase().includes("claude");
}

function transformClaudeSystemToArray(
  system: string | unknown[] | undefined,
): unknown[] {
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
    const hasClaudeCodePrefix = system.some((block) => {
      if (typeof block === "object" && block !== null) {
        const b = block as Record<string, unknown>;
        return (
          b.type === "text" &&
          typeof b.text === "string" &&
          b.text.includes("You are Claude Code")
        );
      }
      return false;
    });

    if (hasClaudeCodePrefix) {
      return system;
    }

    return [{ type: "text", text: CLAUDE_CODE_SYSTEM_PREFIX }, ...system];
  }

  return [{ type: "text", text: CLAUDE_CODE_SYSTEM_PREFIX }];
}

function createAntigravityGeminiFetch(
  getToken: () => Promise<OAuthToken | null>,
  projectId: string,
  sessionId: string,
) {
  const thoughtBuffer = new Map<number, string>();

  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const token = await getToken();
    if (!token) {
      throw new Error(
        "Antigravity OAuth token not available. Please login first.",
      );
    }

    let url = typeof input === "string" ? input : input.toString();

    const modelMatch = url.match(/models\/([^:?/]+)/);
    let modelName = modelMatch ? modelMatch[1] : "gemini-2.5-pro";

    if (modelName.endsWith(":antigravity")) {
      modelName = modelName.replace(":antigravity", "");
    }

    const isStreaming =
      url.includes("streamGenerateContent") || url.includes("stream");

    url = `${ANTIGRAVITY_ENDPOINTS[0]}:streamGenerateContent`;

    if (isStreaming && !url.includes("alt=sse")) {
      url += "?alt=sse";
    }

    // Build headers from scratch (don't inherit from AI SDK to avoid conflicts)
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token.accessToken}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "User-Agent": ANTIGRAVITY_HEADERS["User-Agent"],
      "X-Goog-Api-Client": ANTIGRAVITY_HEADERS["X-Goog-Api-Client"],
      "Client-Metadata": ANTIGRAVITY_HEADERS["Client-Metadata"],
    };

    let body = init?.body;
    if (body && typeof body === "string") {
      try {
        const parsed: RequestBody = JSON.parse(body);

        if (parsed.tools && Array.isArray(parsed.tools)) {
          parsed.tools = cleanToolSchemas(parsed.tools);
        }

        if (parsed.contents && Array.isArray(parsed.contents)) {
          parsed.contents = processToolCallPairing(parsed.contents as never[]);
          // Filter out messages with empty parts (invalid for Gemini API)
          parsed.contents = (
            parsed.contents as Array<{ parts?: unknown[] }>
          ).filter(
            (content) =>
              content.parts &&
              Array.isArray(content.parts) &&
              content.parts.length > 0,
          );
        }

        const wrappedBody = {
          project: projectId,
          model: modelName,
          request: parsed,
          userAgent: "antigravity",
          requestId: `vscode-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        };

        body = JSON.stringify(wrappedBody);
      } catch {
        // Keep original body
      }
    }

    let lastError: Error | null = null;

    for (const endpoint of ANTIGRAVITY_ENDPOINTS) {
      const currentUrl = url.replace(ANTIGRAVITY_ENDPOINTS[0], endpoint);

      try {
        // Use explicit fetch options (don't spread init to avoid conflicts)
        const response = await fetch(currentUrl, {
          method: "POST",
          headers,
          body,
        });

        if (response.ok) {
          if (isStreaming && response.body) {
            const signatureSessionKey = buildSignatureSessionKey(
              sessionId,
              modelName,
              projectId,
            );
            const originalBody = response.body;
            const reader = originalBody.getReader();
            const decoder = new TextDecoder();
            const encoder = new TextEncoder();

            const transformedStream = new ReadableStream({
              async pull(controller) {
                const { done, value } = await reader.read();
                if (done) {
                  controller.close();
                  return;
                }

                const text = decoder.decode(value, { stream: true });
                const lines = text.split("\n");
                const transformedLines: string[] = [];

                for (const line of lines) {
                  if (line.startsWith("data: ")) {
                    try {
                      const chunk = JSON.parse(line.slice(6));
                      cacheThinkingSignaturesFromChunk(
                        chunk,
                        signatureSessionKey,
                        thoughtBuffer,
                      );
                      // Unwrap the response - Antigravity wraps responses in {"response": {...}}
                      // The Google AI SDK expects the unwrapped format
                      const unwrapped = chunk.response || chunk;
                      transformedLines.push(
                        `data: ${JSON.stringify(unwrapped)}`,
                      );
                    } catch {
                      // Keep original line if parsing fails
                      transformedLines.push(line);
                    }
                  } else {
                    transformedLines.push(line);
                  }
                }

                // Encode transformed lines back to bytes
                const transformedText = transformedLines.join("\n");
                controller.enqueue(encoder.encode(transformedText));
              },
            });

            return new Response(transformedStream, {
              headers: response.headers,
              status: response.status,
              statusText: response.statusText,
            });
          }

          return response;
        }

        const errorText = await response.text().catch(() => "");
        lastError = new Error(
          `Antigravity API error: ${response.status} - ${errorText.slice(0, 200)}`,
        );
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw lastError || new Error("All Antigravity endpoints failed");
  };
}

function createAntigravityClaudeFetch(
  getToken: () => Promise<OAuthToken | null>,
  _projectId: string,
  sessionId: string,
) {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const token = await getToken();
    if (!token) {
      throw new Error(
        "Antigravity OAuth token not available. Please login first.",
      );
    }

    const url = typeof input === "string" ? input : input.toString();

    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token.accessToken}`);
    headers.set(
      "anthropic-beta",
      "oauth-2025-04-20,claude-code-20250219,interleaved-thinking-2025-05-14",
    );
    headers.set("Content-Type", "application/json");
    headers.delete("x-api-key");

    let body = init?.body;
    let modelName = "claude-sonnet-4-20250514";

    if (body && typeof body === "string") {
      try {
        const parsed: RequestBody = JSON.parse(body);
        modelName = parsed.model || modelName;

        parsed.system = transformClaudeSystemToArray(parsed.system);

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
        // Keep original body
      }
    }

    const response = await fetch(url, {
      ...init,
      headers,
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Antigravity Claude API error: ${response.status} - ${errorText}`,
      );
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
          // Ignore
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

export function createAntigravityOAuthProvider(
  options: AntigravityOAuthProviderOptions = {},
) {
  const sessionId = options.sessionId || `antigravity-${Date.now()}`;

  const getToken = async (): Promise<OAuthToken | null> => {
    return getValidToken("antigravity", async (refreshToken) => {
      const result = await refreshAntigravityToken(refreshToken);
      const currentToken = await getValidToken("antigravity");
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

  const getProjectId = async (): Promise<string> => {
    if (options.projectId) {
      return options.projectId;
    }
    const token = await getToken();
    return token?.projectId || "default";
  };

  return {
    async createGeminiProvider() {
      const projectId = await getProjectId();
      const customFetch = createAntigravityGeminiFetch(
        getToken,
        projectId,
        sessionId,
      );

      return createGoogleGenerativeAI({
        baseURL: ANTIGRAVITY_ENDPOINTS[0],
        apiKey: "oauth",
        fetch: customFetch,
      });
    },

    async createClaudeProvider() {
      const projectId = await getProjectId();
      const customFetch = createAntigravityClaudeFetch(
        getToken,
        projectId,
        sessionId,
      );

      return createAnthropic({
        baseURL: "https://api.anthropic.com/v1",
        apiKey: "oauth",
        fetch: customFetch,
      });
    },

    async getModel(modelId: string) {
      let cleanModelId = modelId.replace(/^antigravity\//, "");
      cleanModelId = cleanModelId.replace(/:antigravity$/, "");

      if (isClaudeModel(cleanModelId)) {
        const provider = await this.createClaudeProvider();
        return provider(cleanModelId);
      } else {
        const provider = await this.createGeminiProvider();
        return provider(cleanModelId);
      }
    },

    /**
     * Fetch available models with quota information from Antigravity API.
     * Returns models grouped by provider with remaining quota percentage.
     */
    async getAvailableModels(): Promise<OAuthModelInfo[]> {
      const token = await getToken();
      if (!token) {
        return [];
      }

      const projectId = await getProjectId();
      return fetchAvailableModels(token.accessToken, projectId);
    },

    /**
     * Format quota info for display (e.g., "85%" or "85% (resets 14:30 UTC)")
     */
    formatQuotaDisplay(model: OAuthModelInfo): string {
      if (!model.quotaInfo) {
        return "";
      }

      const percent = Math.round(model.quotaInfo.remainingFraction * 100);
      let display = `${percent}%`;

      if (model.quotaInfo.resetTime) {
        // Extract time portion for brevity
        const resetTime = model.quotaInfo.resetTime;
        if (resetTime.includes("T")) {
          const timePart = resetTime.split("T")[1]?.replace("Z", " UTC");
          if (timePart) {
            display += ` (resets ${timePart})`;
          }
        }
      }

      return display;
    },

    /**
     * Get quota bar visualization (e.g., "[████████░░] 80%")
     */
    getQuotaBar(model: OAuthModelInfo): string {
      if (!model.quotaInfo) {
        return "";
      }

      const fraction = model.quotaInfo.remainingFraction;
      const percent = Math.round(fraction * 100);
      const filled = Math.round(percent / 10);
      const bar = "█".repeat(filled) + "░".repeat(10 - filled);

      return `[${bar}] ${percent}%`;
    },
  };
}

export type AntigravityOAuthAIProvider = ReturnType<
  typeof createAntigravityOAuthProvider
>;
