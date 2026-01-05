/* eslint-disable @typescript-eslint/naming-convention */
import { getCachedSignature, cacheSignature } from "./signature-cache";

interface ThinkingBlock {
  type: "thinking";
  thinking: string;
  signature?: string;
}

interface ContentBlock {
  type: string;
  thinking?: string;
  signature?: string;
  text?: string;
  tool_use?: unknown;
  [key: string]: unknown;
}

interface Message {
  role: string;
  content: ContentBlock[] | string;
}

interface GeminiPart {
  thought?: boolean;
  text?: string;
  thoughtSignature?: string;
  functionCall?: unknown;
  functionResponse?: unknown;
}

interface GeminiContent {
  role: string;
  parts: GeminiPart[];
}

function isThinkingBlock(
  block: ContentBlock,
): block is ContentBlock & ThinkingBlock {
  return block.type === "thinking" && typeof block.thinking === "string";
}

function hasSignature(block: ThinkingBlock): boolean {
  return typeof block.signature === "string" && block.signature.length > 0;
}

export function filterUnsignedThinkingBlocks(
  payload: unknown,
  sessionId: string,
  getCachedSignatureFn: (
    sessionId: string,
    text: string,
  ) => string | undefined = getCachedSignature,
): unknown {
  if (typeof payload !== "object" || payload === null) {
    return payload;
  }

  const obj = payload as Record<string, unknown>;

  if (!Array.isArray(obj.messages)) {
    return payload;
  }

  const messages = obj.messages as Message[];
  const filteredMessages = messages.map((message) => {
    if (message.role !== "assistant") {
      return message;
    }

    if (!Array.isArray(message.content)) {
      return message;
    }

    const filteredContent = message.content.filter((block) => {
      if (!isThinkingBlock(block)) {
        return true;
      }

      if (hasSignature(block)) {
        return true;
      }

      const cachedSig = getCachedSignatureFn(sessionId, block.thinking);
      if (cachedSig) {
        block.signature = cachedSig;
        return true;
      }

      return false;
    });

    return { ...message, content: filteredContent };
  });

  return { ...obj, messages: filteredMessages };
}

export function ensureThinkingBeforeToolUse(
  contents: GeminiContent[],
  signatureSessionKey: string,
): GeminiContent[] {
  return contents.map((content) => {
    if (content.role !== "model" && content.role !== "assistant") {
      return content;
    }

    const hasToolUse = content.parts.some((part) => part.functionCall);
    if (!hasToolUse) {
      return content;
    }

    const hasSignedThinking = content.parts.some(
      (part) => part.thought === true && part.thoughtSignature,
    );

    if (hasSignedThinking) {
      return content;
    }

    const thinkingPart = content.parts.find(
      (part) => part.thought === true && part.text,
    );
    if (thinkingPart && thinkingPart.text) {
      const cachedSig = getCachedSignature(
        signatureSessionKey,
        thinkingPart.text,
      );
      if (cachedSig) {
        return {
          ...content,
          parts: content.parts.map((part) => {
            if (part === thinkingPart) {
              return { ...part, thoughtSignature: cachedSig };
            }
            return part;
          }),
        };
      }
    }

    return content;
  });
}

export function needsThinkingWarmup(
  hasToolUse: boolean,
  hasSignedThinking: boolean,
  hasCachedThinking: boolean,
): boolean {
  if (!hasToolUse) {
    return false;
  }

  if (hasSignedThinking) {
    return false;
  }

  if (hasCachedThinking) {
    return false;
  }

  return true;
}

export function handleThinkingRecovery(
  contents: GeminiContent[],
  _signatureSessionKey: string,
): GeminiContent[] {
  if (contents.length === 0) {
    return contents;
  }

  const lastContent = contents[contents.length - 1];
  if (lastContent.role !== "model" && lastContent.role !== "assistant") {
    return contents;
  }

  const hasUnpairedToolUse = lastContent.parts.some(
    (part) => part.functionCall,
  );
  if (!hasUnpairedToolUse) {
    return contents;
  }

  const hasThinking = lastContent.parts.some((part) => part.thought === true);
  if (hasThinking) {
    return contents;
  }

  return contents;
}

export function extractThinkingFromClaudeResponse(
  content: ContentBlock[],
): Array<{ text: string; signature?: string }> {
  const thinkingBlocks: Array<{ text: string; signature?: string }> = [];

  for (const block of content) {
    if (isThinkingBlock(block)) {
      thinkingBlocks.push({
        text: block.thinking,
        signature: block.signature,
      });
    }
  }

  return thinkingBlocks;
}

export function extractThinkingFromGeminiResponse(
  parts: GeminiPart[],
): Array<{ text: string; signature?: string }> {
  const thinkingParts: Array<{ text: string; signature?: string }> = [];

  for (const part of parts) {
    if (part.thought === true && part.text) {
      thinkingParts.push({
        text: part.text,
        signature: part.thoughtSignature,
      });
    }
  }

  return thinkingParts;
}

export function cacheThinkingSignatures(
  sessionId: string,
  thinkingBlocks: Array<{ text: string; signature?: string }>,
): void {
  for (const block of thinkingBlocks) {
    if (block.signature) {
      cacheSignature(sessionId, block.text, block.signature);
    }
  }
}

interface StreamChunk {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
}

export function cacheThinkingSignaturesFromChunk(
  chunk: StreamChunk,
  signatureSessionKey: string,
  thoughtBuffer: Map<number, string>,
): void {
  if (!chunk.candidates) {
    return;
  }

  for (let i = 0; i < chunk.candidates.length; i++) {
    const candidate = chunk.candidates[i];
    const parts = candidate.content?.parts;

    if (!parts) {
      continue;
    }

    for (const part of parts) {
      if (part.thought === true && part.text) {
        const existing = thoughtBuffer.get(i) || "";
        thoughtBuffer.set(i, existing + part.text);
      }

      if (part.thoughtSignature) {
        const fullThought = thoughtBuffer.get(i);
        if (fullThought) {
          cacheSignature(
            signatureSessionKey,
            fullThought,
            part.thoughtSignature,
          );
          thoughtBuffer.delete(i);
        }
      }
    }
  }
}
