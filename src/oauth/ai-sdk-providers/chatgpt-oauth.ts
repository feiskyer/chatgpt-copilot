import { createOpenAI } from "@ai-sdk/openai";
import { OAuthToken } from "../types";
import { getValidToken, setToken } from "../token-storage";
import {
  chatgptOAuthProvider,
  extractAccountIdFromJWT,
} from "../providers/chatgpt";
import { cleanToolSchemas } from "../tool-utils";
import { getCodexInstructions } from "./codex-instructions";

const CHATGPT_BASE_URL = "https://chatgpt.com/backend-api";

export interface ChatGPTOAuthProviderOptions {
  sessionId?: string;
}

interface OpenAIMessage {
  role: string;
  content: string | unknown[];
}

interface CodexInputItem {
  type: "message";
  role: "user" | "assistant" | "developer";
  content: Array<{ type: string; text: string }>;
}

interface CodexRequestBody {
  model?: string;
  input?: CodexInputItem[];
  messages?: OpenAIMessage[];
  tools?: unknown[];
  stream?: boolean;
  instructions?: string;
  store?: boolean;
  include?: string[];
  text?: { verbosity?: string };
  [key: string]: unknown;
}

async function refreshChatGPTToken(refreshToken: string) {
  return chatgptOAuthProvider.refreshToken(refreshToken);
}

interface TransformResult {
  input: CodexInputItem[];
  instructions: string | null;
}

/**
 * Convert message content to Codex content array format.
 */
function convertContentToCodexFormat(
  content: string | unknown[],
  role: string,
): Array<{ type: string; text: string }> {
  const contentType = role === "assistant" ? "output_text" : "input_text";

  if (typeof content === "string") {
    return [{ type: contentType, text: content }];
  }

  if (Array.isArray(content)) {
    const result: Array<{ type: string; text: string }> = [];
    for (const item of content) {
      if (typeof item === "string") {
        result.push({ type: contentType, text: item });
      } else if (typeof item === "object" && item !== null && "type" in item) {
        const typedItem = item as { type: string; text?: string };
        if (typedItem.type === "text" && typedItem.text) {
          result.push({ type: contentType, text: typedItem.text });
        }
      }
    }
    return result;
  }

  return [{ type: contentType, text: String(content) }];
}

/**
 * Transform OpenAI-style messages to Codex API input format.
 *
 * Codex API uses 'input' array with structure:
 * - type: "message"
 * - role: "user" | "assistant" | "developer"
 * - content: [{type: "input_text"|"output_text", text: "..."}]
 */
function transformMessagesToInput(messages: OpenAIMessage[]): TransformResult {
  let instructions: string | null = null;
  const input: CodexInputItem[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      // System messages extracted but not used (Codex requires official instructions)
      if (typeof msg.content === "string") {
        instructions = msg.content;
      } else if (Array.isArray(msg.content)) {
        const textParts = msg.content
          .filter(
            (item): item is { type: string; text: string } =>
              typeof item === "object" &&
              item !== null &&
              "type" in item &&
              item.type === "text",
          )
          .map((item) => item.text);
        if (textParts.length > 0) {
          instructions = textParts.join("\n");
        }
      }
    } else {
      const role = msg.role === "assistant" ? "assistant" : "user";
      const contentArray = convertContentToCodexFormat(msg.content, msg.role);

      if (contentArray.length > 0) {
        input.push({
          type: "message",
          role: role,
          content: contentArray,
        });
      }
    }
  }

  return { input, instructions };
}

function createChatGPTOAuthFetch(
  getToken: () => Promise<OAuthToken | null>,
  _sessionId: string,
) {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const token = await getToken();
    if (!token) {
      throw new Error("ChatGPT OAuth token not available. Please login first.");
    }

    let url = typeof input === "string" ? input : input.toString();

    if (url.includes("/chat/completions")) {
      url = url.replace("/chat/completions", "/codex/responses");
    } else if (
      url.includes("/responses") &&
      !url.includes("/codex/responses")
    ) {
      url = url.replace("/responses", "/codex/responses");
    }

    if (!url.includes("chatgpt.com/backend-api")) {
      const urlObj = new URL(url);
      url = `${CHATGPT_BASE_URL}${urlObj.pathname}${urlObj.search}`;
    }

    const accountId = extractAccountIdFromJWT(token.accessToken);

    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token.accessToken}`);
    headers.set("Content-Type", "application/json");
    headers.set("originator", "codex_cli_rs");
    headers.set("OpenAI-Beta", "responses=experimental");

    if (accountId) {
      headers.set("chatgpt-account-id", accountId);
    }

    let body = init?.body;

    if (body && typeof body === "string") {
      try {
        const parsed: CodexRequestBody = JSON.parse(body);

        const modelName = parsed.model || "gpt-5.2";

        // Convert messages to Codex input format
        if (parsed.messages && !parsed.input) {
          const result = transformMessagesToInput(parsed.messages);
          parsed.input = result.input;
          delete parsed.messages;
        }

        if (parsed.tools && Array.isArray(parsed.tools)) {
          parsed.tools = cleanToolSchemas(parsed.tools);
        }

        // Codex API requires official instructions (validated by backend)
        parsed.instructions = getCodexInstructions(modelName);

        // Required Codex API settings
        if (parsed.store === undefined) {
          parsed.store = false;
        }
        parsed.stream = true;
        if (!parsed.include) {
          parsed.include = ["reasoning.encrypted_content"];
        }
        if (!parsed.text) {
          parsed.text = { verbosity: "medium" };
        }

        body = JSON.stringify(parsed);
      } catch (err) {
        console.error("[ChatGPT OAuth] Failed to transform request body:", err);
      }
    }

    const response = await fetch(url, {
      ...init,
      headers,
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ChatGPT API error: ${response.status} - ${errorText}`);
    }

    return response;
  };
}

export function createChatGPTOAuthProvider(
  options: ChatGPTOAuthProviderOptions = {},
) {
  const sessionId = options.sessionId || `chatgpt-${Date.now()}`;

  const getToken = async (): Promise<OAuthToken | null> => {
    return getValidToken("chatgpt", async (refreshToken) => {
      const result = await refreshChatGPTToken(refreshToken);
      const currentToken = await getValidToken("chatgpt");
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
      const customFetch = createChatGPTOAuthFetch(getToken, sessionId);

      return createOpenAI({
        baseURL: CHATGPT_BASE_URL,
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

export type ChatGPTOAuthAIProvider = ReturnType<
  typeof createChatGPTOAuthProvider
>;
