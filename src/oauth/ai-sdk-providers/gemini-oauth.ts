/* eslint-disable @typescript-eslint/naming-convention */
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { OAuthToken } from "../types";
import { getValidToken, setToken } from "../token-storage";
import { geminiOAuthProvider } from "../providers/gemini";
import {
  cleanToolSchemas,
  processToolCallPairing,
  buildSignatureSessionKey,
  cacheThinkingSignaturesFromChunk,
} from "../tool-utils";

const GEMINI_CODE_ASSIST_ENDPOINT = "https://cloudcode-pa.googleapis.com";

const CODE_ASSIST_HEADERS = {
  "User-Agent": "cloud-code-gemini-vscode/2.0.0 GPN:cloud-code-gemini;",
  "X-Goog-Api-Client": "cloud-code-gemini-vscode/2.0.0",
  // Client-Metadata must be JSON-encoded, not comma-separated
  "Client-Metadata": JSON.stringify({
    clientName: "chatgpt-copilot",
    clientVersion: "1.0.0",
    os: "unknown",
    ideType: "vscode",
    ideVersion: "1.96.0",
    clientId: `chatgpt-copilot-${Date.now()}`,
  }),
};

export interface GeminiOAuthProviderOptions {
  projectId?: string;
  sessionId?: string;
}

interface GeminiRequestBody {
  model?: string;
  contents?: unknown[];
  tools?: unknown[];
  [key: string]: unknown;
}

interface LoadCodeAssistResponse {
  cloudaicompanionProject?: string | { id: string };
}

// Cache for managed project ID (per access token)
const projectIdCache = new Map<string, string>();

async function refreshGeminiToken(refreshToken: string) {
  return geminiOAuthProvider.refreshToken(refreshToken);
}

/**
 * Load managed project ID from Code Assist API.
 */
async function loadManagedProjectId(
  accessToken: string,
): Promise<string | null> {
  const cacheKey = accessToken.slice(0, 20);
  const cached = projectIdCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...CODE_ASSIST_HEADERS,
  };

  const loadBody = {
    metadata: {
      ideType: "IDE_UNSPECIFIED",
      platform: "PLATFORM_UNSPECIFIED",
      pluginType: "GEMINI",
    },
  };

  try {
    const response = await fetch(
      `${GEMINI_CODE_ASSIST_ENDPOINT}/v1internal:loadCodeAssist`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(loadBody),
      },
    );

    if (response.ok) {
      const data: LoadCodeAssistResponse = await response.json();
      const project = data.cloudaicompanionProject;
      let projectId: string | null = null;

      if (typeof project === "string") {
        projectId = project;
      } else if (project && typeof project === "object" && "id" in project) {
        projectId = project.id;
      }

      if (projectId) {
        projectIdCache.set(cacheKey, projectId);
        return projectId;
      }
    }

    // If no project, try to onboard with FREE tier
    const onboardBody = {
      tierId: "FREE",
      metadata: {
        ideType: "IDE_UNSPECIFIED",
        platform: "PLATFORM_UNSPECIFIED",
        pluginType: "GEMINI",
      },
    };

    for (let i = 0; i < 3; i++) {
      const onboardResponse = await fetch(
        `${GEMINI_CODE_ASSIST_ENDPOINT}/v1internal:onboardUser`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(onboardBody),
        },
      );

      if (onboardResponse.ok) {
        const onboardData = await onboardResponse.json();
        if (onboardData.done) {
          const projectId = onboardData.response?.cloudaicompanionProject?.id;
          if (projectId) {
            projectIdCache.set(cacheKey, projectId);
            return projectId;
          }
        }
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  } catch (error) {
    console.error(`[Gemini OAuth] Error loading project ID:`, error);
  }

  return null;
}

function createGeminiOAuthFetch(
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
      throw new Error("Gemini OAuth token not available. Please login first.");
    }

    let url = typeof input === "string" ? input : input.toString();

    const modelMatch = url.match(/models\/([^:?/]+)/);
    let modelName = modelMatch ? modelMatch[1] : "gemini-2.5-pro";

    const isStreaming =
      url.includes("streamGenerateContent") || url.includes("stream");

    // Always use Gemini Code Assist endpoint
    url = `${GEMINI_CODE_ASSIST_ENDPOINT}/v1internal:streamGenerateContent`;
    if (isStreaming && !url.includes("alt=sse")) {
      url += "?alt=sse";
    }

    // Build headers from scratch (don't inherit from AI SDK to avoid conflicts)
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token.accessToken}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "User-Agent": CODE_ASSIST_HEADERS["User-Agent"],
      "X-Goog-Api-Client": CODE_ASSIST_HEADERS["X-Goog-Api-Client"],
      "Client-Metadata": CODE_ASSIST_HEADERS["Client-Metadata"],
    };

    let body = init?.body;
    if (body && typeof body === "string") {
      try {
        const parsed: GeminiRequestBody = JSON.parse(body);

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
          model: modelName, // Just model name, NOT models/${modelName}
          request: parsed,
        };

        body = JSON.stringify(wrappedBody);
      } catch {
        // Keep original body if parsing fails
      }
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Gemini API error: ${response.status} - ${errorText.slice(0, 200)}`,
      );
    }

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
                // Unwrap the response - Gemini Code Assist wraps responses in {"response": {...}}
                // The Google AI SDK expects the unwrapped format
                const unwrapped = chunk.response || chunk;
                transformedLines.push(`data: ${JSON.stringify(unwrapped)}`);
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
  };
}

export function createGeminiOAuthProvider(
  options: GeminiOAuthProviderOptions = {},
) {
  const sessionId = options.sessionId || `gemini-${Date.now()}`;

  const getToken = async (): Promise<OAuthToken | null> => {
    return getValidToken("gemini", async (refreshToken) => {
      const result = await refreshGeminiToken(refreshToken);
      const currentToken = await getValidToken("gemini");
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

    // Get token first
    const token = await getToken();
    if (!token) {
      throw new Error("Gemini OAuth token not available. Please login first.");
    }

    // Load managed project ID from Code Assist API
    const projectId = await loadManagedProjectId(token.accessToken);
    if (!projectId) {
      throw new Error(
        "Failed to get managed project ID for Gemini OAuth. " +
          "Please ensure your Google account has access to Gemini Code Assist.",
      );
    }

    return projectId;
  };

  return {
    async createProvider() {
      const projectId = await getProjectId();
      const customFetch = createGeminiOAuthFetch(
        getToken,
        projectId,
        sessionId,
      );

      return createGoogleGenerativeAI({
        baseURL: `${GEMINI_CODE_ASSIST_ENDPOINT}/v1internal`,
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

export type GeminiOAuthAIProvider = ReturnType<
  typeof createGeminiOAuthProvider
>;
