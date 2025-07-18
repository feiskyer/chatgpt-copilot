/**
 * @author Pengfei Ni
 *
 * @license
 * Copyright (c) 2024 - Present, Pengfei Ni
 *
 * All rights reserved. Code licensed under the ISC license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */

import { logger } from "./logger";
import { ToolSet } from "./mcp";
import { PromptBasedToolCall, PromptBasedToolConfig, PromptBasedToolResult } from "./types";

/**
 * Default configuration for prompt-based tool calls
 */
export const DEFAULT_PROMPT_TOOL_CONFIG: PromptBasedToolConfig = {
  enabled: false,
  toolCallPattern: "<tool_call>",
  maxToolCalls: 10,
};

/**
 * Generates tool descriptions for inclusion in system prompts
 */
export function generateToolDescriptions(toolSet: ToolSet): string {
  if (!toolSet?.tools || Object.keys(toolSet.tools).length === 0) {
    return "";
  }

  const toolDescriptions = Object.entries(toolSet.tools).map(([name, tool]) => {
    const description = tool.description || name;
    const parameters = tool.parameters || {};

    // Extract parameter information
    const paramInfo = Object.entries(parameters.properties || {}).map(([paramName, paramDef]: [string, any]) => {
      const required = parameters.required?.includes(paramName) ? " (required)" : " (optional)";
      const type = paramDef.type || "any";
      const desc = paramDef.description || "";
      return `  - ${paramName} (${type})${required}: ${desc}`;
    }).join("\n");

    return `**${name}**: ${description}
Parameters:
${paramInfo || "  No parameters"}`;
  }).join("\n\n");

  return `# Available Tools

You have access to the following tools. To use a tool, format your response with the tool call syntax shown below:

<tool_call>
<tool_name>function_name</tool_name>
<arguments>
{
  "param1": "value1",
  "param2": "value2"
}
</arguments>
</tool_call>

## Tools:

${toolDescriptions}

Important notes:
- You can make multiple tool calls in a single response
- Always use valid JSON for arguments
- Tool calls will be executed and results will be provided
- Continue your response after tool calls with analysis of the results
`;
}

/**
 * Parses tool calls from AI response text
 */
export function parseToolCalls(text: string): PromptBasedToolCall[] {
  const toolCalls: PromptBasedToolCall[] = [];

  // Regex to match tool call blocks
  const toolCallRegex = /<tool_call>\s*<tool_name>(.*?)<\/tool_name>\s*<arguments>(.*?)<\/arguments>\s*<\/tool_call>/gs;

  let match;
  let callCounter = 0;

  while ((match = toolCallRegex.exec(text)) !== null && callCounter < DEFAULT_PROMPT_TOOL_CONFIG.maxToolCalls) {
    const [fullMatch, toolName, argumentsText] = match;

    try {
      const toolNameTrimmed = toolName.trim();
      const argumentsJson = argumentsText.trim();

      let parsedArguments: Record<string, any> = {};
      if (argumentsJson) {
        try {
          parsedArguments = JSON.parse(argumentsJson);
        } catch (parseError) {
          logger.appendLine(`WARN: Failed to parse tool arguments for ${toolNameTrimmed}: ${parseError}`);
          // Try to extract simple key-value pairs as fallback
          parsedArguments = extractSimpleArguments(argumentsJson);
        }
      }

      const toolCall: PromptBasedToolCall = {
        id: `prompt-tool-${Date.now()}-${callCounter}`,
        toolName: toolNameTrimmed,
        arguments: parsedArguments,
        rawText: fullMatch,
      };

      toolCalls.push(toolCall);
      callCounter++;

    } catch (error) {
      logger.appendLine(`ERROR: Failed to parse tool call: ${error}`);
    }
  }

  return toolCalls;
}

/**
 * Fallback argument parser for non-JSON formats
 */
function extractSimpleArguments(text: string): Record<string, any> {
  const args: Record<string, any> = {};

  // Try to extract key: value pairs
  const keyValueRegex = /(\w+):\s*["']?([^"'\n,}]+)["']?/g;
  let match;

  while ((match = keyValueRegex.exec(text)) !== null) {
    const [, key, value] = match;
    args[key.trim()] = value.trim();
  }

  return args;
}

/**
 * Executes a prompt-based tool call
 */
export async function executePromptToolCall(
  toolCall: PromptBasedToolCall,
  toolSet: ToolSet
): Promise<PromptBasedToolResult> {
  try {
    const tool = toolSet.tools[toolCall.toolName];

    if (!tool) {
      return {
        id: toolCall.id,
        toolName: toolCall.toolName,
        result: null,
        error: `Tool '${toolCall.toolName}' not found`,
      };
    }

    logger.appendLine(`INFO: Executing prompt-based tool call: ${toolCall.toolName}`);

    // Execute the tool
    if (!tool.execute) {
      return {
        id: toolCall.id,
        toolName: toolCall.toolName,
        result: null,
        error: `Tool '${toolCall.toolName}' has no execute function`,
      };
    }

    const result = await tool.execute(toolCall.arguments, {
      toolCallId: toolCall.id,
      messages: []
    });

    return {
      id: toolCall.id,
      toolName: toolCall.toolName,
      result: result,
    };

  } catch (error) {
    logger.appendLine(`ERROR: Tool execution failed for ${toolCall.toolName}: ${error}`);

    return {
      id: toolCall.id,
      toolName: toolCall.toolName,
      result: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Processes text to find and execute tool calls, returning updated text with results
 */
export async function processPromptBasedToolCalls(
  text: string,
  toolSet: ToolSet,
  onToolCall?: (toolCall: PromptBasedToolCall) => void,
  onToolResult?: (result: PromptBasedToolResult) => void
): Promise<{ updatedText: string; toolCalls: PromptBasedToolCall[]; results: PromptBasedToolResult[]; }> {

  const toolCalls = parseToolCalls(text);
  const results: PromptBasedToolResult[] = [];
  let updatedText = text;

  if (toolCalls.length === 0) {
    return { updatedText, toolCalls, results };
  }

  logger.appendLine(`INFO: Found ${toolCalls.length} prompt-based tool calls`);

  // Execute tool calls sequentially
  for (const toolCall of toolCalls) {
    // Notify about tool call
    if (onToolCall) {
      onToolCall(toolCall);
    }

    // Execute the tool
    const result = await executePromptToolCall(toolCall, toolSet);
    results.push(result);

    // Notify about result
    if (onToolResult) {
      onToolResult(result);
    }
  }

  return { updatedText, toolCalls, results };
}
