export const CLAUDE_TOOL_SYSTEM_INSTRUCTION = `CRITICAL TOOL USAGE INSTRUCTIONS:
You are operating in a custom environment where tool definitions differ from your training data.
You MUST follow these rules strictly:
1. DO NOT use your internal training data to guess tool parameters
2. ONLY use the exact parameter structure defined in the tool schema
3. Parameter names in schemas are EXACT - do not substitute with similar names
4. Array parameters have specific item types - check the 'items' field
5. When you see "STRICT PARAMETERS", those type definitions override assumptions
6. Tool use in agentic workflows is REQUIRED - call tools with exact parameters`;

const STRICT_PARAMS_MARKER = "STRICT PARAMETERS:";

interface ToolParameter {
  type?: string;
  description?: string;
  items?: { type?: string };
  enum?: unknown[];
  properties?: Record<string, ToolParameter>;
  required?: string[];
}

export interface ToolSchema {
  name: string;
  description?: string;
  parameters?: {
    type?: string;
    properties?: Record<string, ToolParameter>;
    required?: string[];
  };
  inputSchema?: {
    type?: string;
    properties?: Record<string, ToolParameter>;
    required?: string[];
  };
  [key: string]: unknown;
}

function formatParameterType(param: ToolParameter): string {
  if (!param.type) {
    return "any";
  }

  if (param.type === "array" && param.items?.type) {
    return `${param.items.type}[]`;
  }

  if (param.enum && param.enum.length > 0) {
    return param.enum.map((v) => JSON.stringify(v)).join(" | ");
  }

  return param.type;
}

function buildParameterSignature(
  properties: Record<string, ToolParameter>,
  required: string[] = [],
): string {
  const parts: string[] = [];

  for (const [name, param] of Object.entries(properties)) {
    const isRequired = required.includes(name);
    const type = formatParameterType(param);
    parts.push(`${name} (${type}${isRequired ? ", REQUIRED" : ""})`);
  }

  return parts.join(", ");
}

export function injectParameterSignatures(
  tools: unknown[],
  promptTemplate?: string,
): ToolSchema[] {
  const toolArray = tools as ToolSchema[];
  return toolArray.map((tool) => {
    const schema = tool.parameters || tool.inputSchema;
    if (!schema?.properties) {
      return tool;
    }

    if (tool.description?.includes(STRICT_PARAMS_MARKER)) {
      return tool;
    }

    const signature = buildParameterSignature(
      schema.properties,
      schema.required,
    );

    if (!signature) {
      return tool;
    }

    const template =
      promptTemplate || `\n\n${STRICT_PARAMS_MARKER} ${signature}`;
    const newDescription = (tool.description || "") + template;

    return {
      ...tool,
      description: newDescription,
    };
  });
}

interface SystemContentBlock {
  type: string;
  text?: string;
}

export function injectToolHardeningInstruction(
  payload: Record<string, unknown>,
  instruction: string = CLAUDE_TOOL_SYSTEM_INSTRUCTION,
): void {
  if (!payload.system) {
    payload.system = [{ type: "text", text: instruction }];
    return;
  }

  if (typeof payload.system === "string") {
    payload.system = [
      { type: "text", text: instruction },
      { type: "text", text: payload.system },
    ];
    return;
  }

  if (Array.isArray(payload.system)) {
    const systemBlocks = payload.system as SystemContentBlock[];

    const hasInstruction = systemBlocks.some(
      (block) =>
        block.type === "text" &&
        block.text?.includes("CRITICAL TOOL USAGE INSTRUCTIONS"),
    );

    if (!hasInstruction) {
      systemBlocks.unshift({ type: "text", text: instruction });
    }
  }
}

export function hasToolUse(contents: unknown[]): boolean {
  if (!Array.isArray(contents)) {
    return false;
  }

  return contents.some((content) => {
    if (typeof content !== "object" || content === null) {
      return false;
    }

    const msg = content as Record<string, unknown>;
    if (msg.role !== "assistant") {
      return false;
    }

    // Check Gemini format (functionCall in parts)
    if (Array.isArray(msg.parts)) {
      const hasFunctionCall = msg.parts.some(
        (part) =>
          typeof part === "object" && part !== null && "functionCall" in part,
      );
      if (hasFunctionCall) {
        return true;
      }
    }

    // Check Claude format (tool_use in content)
    if (Array.isArray(msg.content)) {
      const hasToolUseBlock = msg.content.some(
        (block) =>
          typeof block === "object" &&
          block !== null &&
          (block as Record<string, unknown>).type === "tool_use",
      );
      if (hasToolUseBlock) {
        return true;
      }
    }

    return false;
  });
}
