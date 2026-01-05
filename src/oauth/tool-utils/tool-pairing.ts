interface FunctionCall {
  name: string;
  args?: unknown;
}

interface FunctionResponse {
  name: string;
  response?: unknown;
}

interface GeminiPart {
  functionCall?: FunctionCall & { id?: string };
  functionResponse?: FunctionResponse & { id?: string };
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
}

interface GeminiContent {
  role: string;
  parts: GeminiPart[];
}

let toolCallCounter = 0;

function generateToolCallId(): string {
  return `tc_${Date.now()}_${++toolCallCounter}`;
}

export function assignToolCallIds(contents: GeminiContent[]): {
  contents: GeminiContent[];
  pendingCallIdsByName: Map<string, string[]>;
} {
  const pendingCallIdsByName = new Map<string, string[]>();

  const updatedContents = contents.map((content) => {
    if (content.role !== "model" && content.role !== "assistant") {
      return content;
    }

    const updatedParts = content.parts.map((part) => {
      if (!part.functionCall) {
        return part;
      }

      const id = part.functionCall.id || generateToolCallId();
      const name = part.functionCall.name;

      if (!pendingCallIdsByName.has(name)) {
        pendingCallIdsByName.set(name, []);
      }
      pendingCallIdsByName.get(name)!.push(id);

      return {
        ...part,
        functionCall: {
          ...part.functionCall,
          id,
        },
      };
    });

    return { ...content, parts: updatedParts };
  });

  return { contents: updatedContents, pendingCallIdsByName };
}

export function matchToolResponseIds(
  contents: GeminiContent[],
  pendingCallIdsByName: Map<string, string[]>,
): GeminiContent[] {
  return contents.map((content) => {
    if (content.role !== "user" && content.role !== "function") {
      return content;
    }

    const updatedParts = content.parts.map((part) => {
      if (!part.functionResponse) {
        return part;
      }

      if (part.functionResponse.id) {
        return part;
      }

      const name = part.functionResponse.name;
      const pendingIds = pendingCallIdsByName.get(name);

      if (!pendingIds || pendingIds.length === 0) {
        return part;
      }

      const id = pendingIds.shift()!;

      return {
        ...part,
        functionResponse: {
          ...part.functionResponse,
          id,
        },
      };
    });

    return { ...content, parts: updatedParts };
  });
}

export function fixToolResponseGrouping(
  contents: GeminiContent[],
): GeminiContent[] {
  const callIdToName = new Map<string, string>();
  const responseIdToName = new Map<string, string>();

  for (const content of contents) {
    for (const part of content.parts) {
      if (part.functionCall?.id) {
        callIdToName.set(part.functionCall.id, part.functionCall.name);
      }
      if (part.functionResponse?.id) {
        responseIdToName.set(
          part.functionResponse.id,
          part.functionResponse.name,
        );
      }
    }
  }

  const orphanedResponses: GeminiPart[] = [];
  const matchedCallIds = new Set<string>();

  for (const content of contents) {
    for (const part of content.parts) {
      if (part.functionResponse?.id) {
        const responseId = part.functionResponse.id;
        if (callIdToName.has(responseId)) {
          matchedCallIds.add(responseId);
        } else {
          orphanedResponses.push(part);
        }
      }
    }
  }

  if (orphanedResponses.length === 0) {
    return contents;
  }

  const unmatchedCallIds: string[] = [];
  for (const [id] of callIdToName) {
    if (!matchedCallIds.has(id)) {
      unmatchedCallIds.push(id);
    }
  }

  return contents.map((content) => {
    const updatedParts = content.parts.map((part) => {
      if (!part.functionResponse?.id) {
        return part;
      }

      const responseId = part.functionResponse.id;
      if (callIdToName.has(responseId)) {
        return part;
      }

      const responseName = part.functionResponse.name;
      const matchingCallId = unmatchedCallIds.find(
        (id) => callIdToName.get(id) === responseName,
      );

      if (matchingCallId) {
        const idx = unmatchedCallIds.indexOf(matchingCallId);
        unmatchedCallIds.splice(idx, 1);

        return {
          ...part,
          functionResponse: {
            ...part.functionResponse,
            id: matchingCallId,
          },
        };
      }

      return part;
    });

    return { ...content, parts: updatedParts };
  });
}

export function processToolCallPairing(
  contents: GeminiContent[],
): GeminiContent[] {
  const { contents: withIds, pendingCallIdsByName } =
    assignToolCallIds(contents);
  const withMatchedResponses = matchToolResponseIds(
    withIds,
    pendingCallIdsByName,
  );
  return fixToolResponseGrouping(withMatchedResponses);
}

export function extractToolCallsFromContent(content: GeminiContent): Array<{
  id: string;
  name: string;
  args: unknown;
}> {
  const toolCalls: Array<{ id: string; name: string; args: unknown }> = [];

  for (const part of content.parts) {
    if (part.functionCall) {
      toolCalls.push({
        id: part.functionCall.id || generateToolCallId(),
        name: part.functionCall.name,
        args: part.functionCall.args,
      });
    }
  }

  return toolCalls;
}

export function createToolResponseContent(
  responses: Array<{ id: string; name: string; response: unknown }>,
): GeminiContent {
  return {
    role: "user",
    parts: responses.map((r) => ({
      functionResponse: {
        id: r.id,
        name: r.name,
        response: r.response,
      },
    })),
  };
}
