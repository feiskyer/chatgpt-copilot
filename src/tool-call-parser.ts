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
import { PromptBasedToolCall } from "./types";

/**
 * Enhanced tool call parser that supports multiple formats
 */
export class ToolCallParser {
  private static readonly PATTERNS = {
    // Primary format: <tool_call><tool_name>name</tool_name><arguments>json</arguments></tool_call>
    XML_STYLE: /<tool_call>\s*<tool_name>(.*?)<\/tool_name>\s*<arguments>(.*?)<\/arguments>\s*<\/tool_call>/gs,

    // Alternative format: ```tool_call\nname\njson\n```
    MARKDOWN_STYLE: /```tool_call\s*\n([^\n]+)\n(.*?)\n```/gs,

    // Function call style: function_name({"param": "value"})
    FUNCTION_STYLE: /(\w+)\s*\(\s*(\{.*?\})\s*\)/gs,

    // JSON style: {"tool": "name", "arguments": {...}}
    JSON_STYLE: /\{\s*"tool"\s*:\s*"([^"]+)"\s*,\s*"arguments"\s*:\s*(\{.*?\})\s*\}/gs,
  };

  /**
   * Parse tool calls from text using multiple patterns
   */
  static parseToolCalls(text: string, maxCalls: number = 10): PromptBasedToolCall[] {
    const toolCalls: PromptBasedToolCall[] = [];
    let callCounter = 0;

    // Try each pattern in order of preference
    for (const [patternName, pattern] of Object.entries(this.PATTERNS)) {
      if (callCounter >= maxCalls) break;

      const calls = this.parseWithPattern(text, pattern, patternName, callCounter, maxCalls);
      toolCalls.push(...calls);
      callCounter += calls.length;
    }

    // Remove duplicates based on tool name and arguments
    return this.removeDuplicates(toolCalls);
  }

  /**
   * Parse tool calls using a specific pattern
   */
  private static parseWithPattern(
    text: string,
    pattern: RegExp,
    patternName: string,
    startCounter: number,
    maxCalls: number
  ): PromptBasedToolCall[] {
    const toolCalls: PromptBasedToolCall[] = [];
    let match;
    let callCounter = startCounter;

    // Reset regex lastIndex
    pattern.lastIndex = 0;

    while ((match = pattern.exec(text)) !== null && callCounter < maxCalls) {
      try {
        const toolCall = this.createToolCall(match, patternName, callCounter);
        if (toolCall) {
          toolCalls.push(toolCall);
          callCounter++;
        }
      } catch (error) {
        logger.appendLine(`WARN: Failed to parse tool call with ${patternName}: ${error}`);
      }
    }

    if (toolCalls.length > 0) {
      logger.appendLine(`INFO: Parsed ${toolCalls.length} tool calls using ${patternName} pattern`);
    }

    return toolCalls;
  }

  /**
   * Create a tool call object from regex match
   */
  private static createToolCall(
    match: RegExpExecArray,
    patternName: string,
    counter: number
  ): PromptBasedToolCall | null {
    const [fullMatch, toolName, argumentsText] = match;

    if (!toolName?.trim()) {
      return null;
    }

    const toolNameTrimmed = toolName.trim();
    let parsedArguments: Record<string, any> = {};

    if (argumentsText?.trim()) {
      try {
        parsedArguments = JSON.parse(argumentsText.trim());
      } catch (parseError) {
        logger.appendLine(`WARN: Failed to parse JSON arguments for ${toolNameTrimmed}: ${parseError}`);

        // Try fallback parsing
        parsedArguments = this.extractFallbackArguments(argumentsText.trim());
      }
    }

    return {
      id: `prompt-tool-${Date.now()}-${counter}`,
      toolName: toolNameTrimmed,
      arguments: parsedArguments,
      rawText: fullMatch,
    };
  }

  /**
   * Extract arguments using fallback methods when JSON parsing fails
   */
  private static extractFallbackArguments(text: string): Record<string, any> {
    const args: Record<string, any> = {};

    // Try to extract key-value pairs in various formats
    const patterns = [
      // key: "value" or key: 'value'
      /(\w+)\s*:\s*["']([^"']+)["']/g,
      // key: value (without quotes)
      /(\w+)\s*:\s*([^,}\n]+)/g,
      // "key": "value"
      /"(\w+)"\s*:\s*"([^"]+)"/g,
    ];

    for (const pattern of patterns) {
      let match;
      pattern.lastIndex = 0;

      while ((match = pattern.exec(text)) !== null) {
        const [, key, value] = match;
        if (key && value) {
          args[key.trim()] = value.trim();
        }
      }
    }

    return args;
  }

  /**
   * Remove duplicate tool calls
   */
  private static removeDuplicates(toolCalls: PromptBasedToolCall[]): PromptBasedToolCall[] {
    const seen = new Set<string>();
    return toolCalls.filter(call => {
      const signature = `${call.toolName}:${JSON.stringify(call.arguments)}`;
      if (seen.has(signature)) {
        return false;
      }
      seen.add(signature);
      return true;
    });
  }

  /**
   * Check if text contains potential tool calls
   */
  static containsToolCalls(text: string): boolean {
    for (const pattern of Object.values(this.PATTERNS)) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Extract text content without tool calls
   */
  static extractTextWithoutToolCalls(text: string): string {
    let cleanText = text;

    for (const pattern of Object.values(this.PATTERNS)) {
      pattern.lastIndex = 0;
      cleanText = cleanText.replace(pattern, '');
    }

    // Clean up extra whitespace
    return cleanText.replace(/\n\s*\n\s*\n/g, '\n\n').trim();
  }

  /**
   * Validate tool call format
   */
  static validateToolCall(toolCall: PromptBasedToolCall): { valid: boolean; errors: string[]; } {
    const errors: string[] = [];

    if (!toolCall.toolName) {
      errors.push("Tool name is required");
    }

    if (typeof toolCall.arguments !== 'object' || toolCall.arguments === null) {
      errors.push("Arguments must be an object");
    }

    if (!toolCall.id) {
      errors.push("Tool call ID is required");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Format tool call for display
   */
  static formatToolCallForDisplay(toolCall: PromptBasedToolCall): string {
    return `Tool: ${toolCall.toolName}\nArguments: ${JSON.stringify(toolCall.arguments, null, 2)}`;
  }

  /**
   * Generate tool call text in the standard format
   */
  static generateToolCallText(toolName: string, arguments_: Record<string, any>): string {
    return `<tool_call>
<tool_name>${toolName}</tool_name>
<arguments>
${JSON.stringify(arguments_, null, 2)}
</arguments>
</tool_call>`;
  }
}
