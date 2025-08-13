/**
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

interface ParsingStrategy {
  name: string;
  pattern: RegExp;
  priority: number;
  validator?: (match: RegExpExecArray) => boolean;
}

interface ParseResult {
  toolCalls: PromptBasedToolCall[];
  errors: string[];
  partialContent: string;
}

/**
 * Enhanced tool call parser with robust parsing strategies and streaming support
 */
export class ToolCallParser {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  private static readonly PARSING_STRATEGIES: ParsingStrategy[] = [
    {
      name: "XML_STYLE",
      pattern:
        /<tool_call>\s*<tool_name>(.*?)<\/tool_name>\s*<arguments>(.*?)<\/arguments>\s*<\/tool_call>/gs,
      priority: 1,
      validator: (match) => !!(match[1]?.trim() && match[2]?.trim()),
    },
    {
      name: "XML_STYLE_MULTILINE",
      pattern:
        /<tool_call[^>]*>\s*<tool_name>\s*(.*?)\s*<\/tool_name>\s*<arguments>\s*(.*?)\s*<\/arguments>\s*<\/tool_call>/gs,
      priority: 1,
    },
    {
      name: "MARKDOWN_STYLE",
      pattern: /```tool_call\s*\n([^\n]+)\n(.*?)\n```/gs,
      priority: 2,
    },
    {
      name: "FUNCTION_STYLE",
      pattern: /(\w+)\s*\(\s*(\{.*?\})\s*\)/gs,
      priority: 3,
    },
    {
      name: "JSON_STYLE",
      pattern:
        /\{\s*["']?tool["']?\s*:\s*["']([^"']+)["']\s*,\s*["']?arguments["']?\s*:\s*(\{.*?\})\s*\}/gs,
      priority: 4,
    },
  ];

  // Buffer for streaming content
  private streamBuffer: string = "";
  private completedToolCalls: PromptBasedToolCall[] = [];
  private parsingErrors: string[] = [];

  /**
   * Parse tool calls from streaming text with improved buffering
   */
  static parseToolCalls(
    text: string,
    maxCalls: number = 10,
    isStreaming: boolean = false,
  ): ParseResult {
    const parser = new ToolCallParser();
    return parser.parseStreamingText(text, maxCalls, isStreaming);
  }

  /**
   * Parse tool calls with streaming support and buffering
   */
  parseStreamingText(
    text: string,
    maxCalls: number = 10,
    isStreaming: boolean = false,
  ): ParseResult {
    // Add new text to buffer
    this.streamBuffer += text;

    const toolCalls: PromptBasedToolCall[] = [];
    const errors: string[] = [];
    let partialContent = "";

    // For streaming, only parse complete tool calls
    if (isStreaming) {
      const { complete, remaining } = this.extractCompleteToolCalls(
        this.streamBuffer,
      );
      this.streamBuffer = remaining;

      if (complete.length > 0) {
        const result = this.parseCompleteText(complete, maxCalls);
        toolCalls.push(...result.toolCalls);
        errors.push(...result.errors);
      }

      partialContent = remaining;
    } else {
      // For non-streaming, parse all available content
      const result = this.parseCompleteText(this.streamBuffer, maxCalls);
      toolCalls.push(...result.toolCalls);
      errors.push(...result.errors);
      this.streamBuffer = ""; // Clear buffer for non-streaming
    }

    // Add to completed calls and remove duplicates
    this.completedToolCalls.push(...toolCalls);
    this.completedToolCalls = this.removeDuplicates(this.completedToolCalls);

    return {
      toolCalls: this.removeDuplicates([...this.completedToolCalls]),
      errors: [...this.parsingErrors, ...errors],
      partialContent,
    };
  }

  /**
   * Extract only complete tool calls from streaming text
   */
  private extractCompleteToolCalls(text: string): {
    complete: string;
    remaining: string;
  } {
    let lastCompleteIndex = -1;

    // Check for complete XML-style tool calls
    const xmlMatches = [
      ...text.matchAll(/<tool_call[^>]*>[\s\S]*?<\/tool_call>/g),
    ];
    if (xmlMatches.length > 0) {
      const lastMatch = xmlMatches[xmlMatches.length - 1];
      lastCompleteIndex = Math.max(
        lastCompleteIndex,
        lastMatch.index! + lastMatch[0].length,
      );
    }

    // Check for complete markdown-style tool calls
    const markdownMatches = [...text.matchAll(/```tool_call[\s\S]*?```/g)];
    if (markdownMatches.length > 0) {
      const lastMatch = markdownMatches[markdownMatches.length - 1];
      lastCompleteIndex = Math.max(
        lastCompleteIndex,
        lastMatch.index! + lastMatch[0].length,
      );
    }

    if (lastCompleteIndex >= 0) {
      return {
        complete: text.substring(0, lastCompleteIndex),
        remaining: text.substring(lastCompleteIndex),
      };
    }

    return { complete: "", remaining: text };
  }

  /**
   * Parse complete (non-streaming) text
   */
  private parseCompleteText(text: string, maxCalls: number): ParseResult {
    const toolCalls: PromptBasedToolCall[] = [];
    const errors: string[] = [];
    let callCounter = 0;

    // Try each parsing strategy in order of priority
    const sortedStrategies = ToolCallParser.PARSING_STRATEGIES.sort(
      (a, b) => a.priority - b.priority,
    );

    for (const strategy of sortedStrategies) {
      if (callCounter >= maxCalls) {
        break;
      }

      const { calls, strategyErrors } = this.parseWithStrategy(
        text,
        strategy,
        callCounter,
        maxCalls,
      );

      toolCalls.push(...calls);
      errors.push(...strategyErrors);
      callCounter += calls.length;
    }

    return {
      toolCalls: this.removeDuplicates(toolCalls),
      errors,
      partialContent: "",
    };
  }

  /**
   * Parse tool calls using a specific strategy
   */
  private parseWithStrategy(
    text: string,
    strategy: ParsingStrategy,
    startCounter: number,
    maxCalls: number,
  ): { calls: PromptBasedToolCall[]; strategyErrors: string[] } {
    const toolCalls: PromptBasedToolCall[] = [];
    const strategyErrors: string[] = [];
    let match;
    let callCounter = startCounter;

    // Reset regex lastIndex
    strategy.pattern.lastIndex = 0;

    while (
      (match = strategy.pattern.exec(text)) !== null &&
      callCounter < maxCalls
    ) {
      try {
        // Apply validator if present
        if (strategy.validator && !strategy.validator(match)) {
          continue;
        }

        const toolCall = this.createToolCallFromMatch(
          match,
          strategy.name,
          callCounter,
        );
        if (toolCall) {
          toolCalls.push(toolCall);
          callCounter++;
        }
      } catch (error) {
        const errorMsg = `Failed to parse tool call with ${strategy.name}: ${error}`;
        strategyErrors.push(errorMsg);
        logger.appendLine(`WARN: ${errorMsg}`);
      }
    }

    if (toolCalls.length > 0) {
      logger.appendLine(
        `INFO: Parsed ${toolCalls.length} tool calls using ${strategy.name} strategy`,
      );
    }

    return { calls: toolCalls, strategyErrors };
  }

  /**
   * Create a tool call object from regex match with enhanced parsing
   */
  private createToolCallFromMatch(
    match: RegExpExecArray,
    strategyName: string,
    counter: number,
  ): PromptBasedToolCall | null {
    const [fullMatch, toolName, argumentsText] = match;

    if (!toolName?.trim()) {
      return null;
    }

    const toolNameTrimmed = toolName.trim();
    let parsedArguments: Record<string, any> = {};

    if (argumentsText?.trim()) {
      const parseResult = this.parseArgumentsWithFallback(
        argumentsText.trim(),
        toolNameTrimmed,
      );
      parsedArguments = parseResult.arguments;

      if (parseResult.errors.length > 0) {
        this.parsingErrors.push(...parseResult.errors);
      }
    }

    const toolCall: PromptBasedToolCall = {
      id: `prompt-tool-${Date.now()}-${counter}`,
      toolName: toolNameTrimmed,
      arguments: parsedArguments,
      rawText: fullMatch,
    };

    // Validate the tool call
    const validation = ToolCallParser.validateToolCall(toolCall);
    if (!validation.valid) {
      logger.appendLine(
        `WARN: Invalid tool call created: ${validation.errors.join(", ")}`,
      );
      return null;
    }

    return toolCall;
  }

  /**
   * Progressive JSON parsing with multiple fallback strategies
   */
  private parseArgumentsWithFallback(
    argumentsText: string,
    toolName: string,
  ): { arguments: Record<string, any>; errors: string[] } {
    const errors: string[] = [];

    // Strategy 1: Direct JSON parse
    try {
      const parsed = JSON.parse(argumentsText);
      if (typeof parsed === "object" && parsed !== null) {
        return { arguments: parsed, errors };
      }
    } catch (error) {
      errors.push(`Direct JSON parse failed: ${error}`);
    }

    // Strategy 2: Clean and retry JSON parse
    try {
      const cleaned = this.cleanJsonText(argumentsText);
      const parsed = JSON.parse(cleaned);
      if (typeof parsed === "object" && parsed !== null) {
        logger.appendLine(
          `INFO: Successfully parsed arguments for ${toolName} after cleaning`,
        );
        return { arguments: parsed, errors };
      }
    } catch (error) {
      errors.push(`Cleaned JSON parse failed: ${error}`);
    }

    // Strategy 3: Progressive JSON repair
    try {
      const repaired = this.repairJsonText(argumentsText);
      const parsed = JSON.parse(repaired);
      if (typeof parsed === "object" && parsed !== null) {
        logger.appendLine(
          `INFO: Successfully parsed arguments for ${toolName} after repair`,
        );
        return { arguments: parsed, errors };
      }
    } catch (error) {
      errors.push(`Repaired JSON parse failed: ${error}`);
    }

    // Strategy 4: YAML-style parsing
    try {
      const yamlParsed = this.parseYamlStyleArguments(argumentsText);
      if (Object.keys(yamlParsed).length > 0) {
        logger.appendLine(
          `INFO: Successfully parsed arguments for ${toolName} using YAML-style parser`,
        );
        return { arguments: yamlParsed, errors };
      }
    } catch (error) {
      errors.push(`YAML-style parse failed: ${error}`);
    }

    // Strategy 5: Simple key-value extraction (original fallback)
    try {
      const simple = this.extractSimpleKeyValuePairs(argumentsText);
      logger.appendLine(
        `WARN: Used simple key-value extraction for ${toolName}`,
      );
      return { arguments: simple, errors };
    } catch (error) {
      errors.push(`Simple extraction failed: ${error}`);
    }

    // Final fallback: return empty object
    errors.push(`All parsing strategies failed for tool ${toolName}`);
    return { arguments: {}, errors };
  }

  /**
   * Remove duplicate tool calls with enhanced deduplication logic
   */
  private removeDuplicates(
    toolCalls: PromptBasedToolCall[],
  ): PromptBasedToolCall[] {
    const seen = new Set<string>();
    const result: PromptBasedToolCall[] = [];

    for (const call of toolCalls) {
      // Create a normalized signature for deduplication
      const signature = this.createToolCallSignature(call);

      if (!seen.has(signature)) {
        seen.add(signature);
        result.push(call);
      } else {
        logger.appendLine(
          `INFO: Removed duplicate tool call: ${call.toolName}`,
        );
      }
    }

    return result;
  }

  /**
   * Check if text contains potential tool calls
   */
  static containsToolCalls(text: string): boolean {
    for (const strategy of ToolCallParser.PARSING_STRATEGIES) {
      strategy.pattern.lastIndex = 0;
      if (strategy.pattern.test(text)) {
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

    for (const strategy of ToolCallParser.PARSING_STRATEGIES) {
      strategy.pattern.lastIndex = 0;
      cleanText = cleanText.replace(strategy.pattern, "");
    }

    // Clean up extra whitespace and normalize line breaks
    return cleanText
      .replace(/\n\s*\n\s*\n+/g, "\n\n")
      .replace(/^\s+|\s+$/g, "")
      .trim();
  }

  /**
   * Validate tool call format
   */
  static validateToolCall(toolCall: PromptBasedToolCall): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!toolCall.toolName) {
      errors.push("Tool name is required");
    }

    if (typeof toolCall.arguments !== "object" || toolCall.arguments === null) {
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
  static generateToolCallText(
    toolName: string,
    arguments_: Record<string, any>,
  ): string {
    return `<tool_call>
<tool_name>${toolName}</tool_name>
<arguments>
${JSON.stringify(arguments_, null, 2)}
</arguments>
</tool_call>`;
  }

  private cleanJsonText(text: string): string {
    return text
      .trim()
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]")
      .replace(/'/g, '"')
      .replace(/(\w+):/g, '"$1":')
      .replace(/"true"/g, "true")
      .replace(/"false"/g, "false")
      .replace(/"null"/g, "null")
      .replace(/\/\*.*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
      .replace(/\s+/g, " ");
  }

  private repairJsonText(text: string): string {
    let repaired = this.cleanJsonText(text);
    const openBraces = (repaired.match(/\{/g) || []).length;
    const closeBraces = (repaired.match(/\}/g) || []).length;
    if (openBraces > closeBraces) {
      repaired += "}".repeat(openBraces - closeBraces);
    }
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/\]/g) || []).length;
    if (openBrackets > closeBrackets) {
      repaired += "]".repeat(openBrackets - closeBrackets);
    }
    repaired = repaired.replace(/:([^"{[\]}\\d][^,}\]]*)/g, ':"$1"');
    return repaired;
  }

  private parseYamlStyleArguments(text: string): Record<string, any> {
    const args: Record<string, any> = {};
    const lines = text.split("\n");
    for (const line of lines) {
      const match = line.match(/^\s*(\w+)\s*:\s*(.+?)\s*$/);
      if (match) {
        const [, key, value] = match;
        args[key] = this.coerceValue(value.trim());
      }
    }
    return args;
  }

  private coerceValue(value: string): any {
    const trimmed = value.replace(/^["']|["']$/g, "");
    if (trimmed.toLowerCase() === "true") {
      return true;
    }
    if (trimmed.toLowerCase() === "false") {
      return false;
    }
    if (trimmed.toLowerCase() === "null") {
      return null;
    }
    if (/^-?\d+$/.test(trimmed)) {
      return parseInt(trimmed, 10);
    }
    if (/^-?\d*\.\d+$/.test(trimmed)) {
      return parseFloat(trimmed);
    }
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        return JSON.parse(trimmed);
      } catch {
        const items = trimmed
          .slice(1, -1)
          .split(",")
          .map((item) => this.coerceValue(item.trim()));
        return items;
      }
    }
    return trimmed;
  }

  private extractSimpleKeyValuePairs(text: string): Record<string, any> {
    const args: Record<string, any> = {};
    const patterns = [
      /"(\w+)"\s*:\s*["']([^"']+)["']/g,
      /(\w+)\s*:\s*["']([^"']+)["']/g,
      /"(\w+)"\s*:\s*([^,}\n]+)/g,
      /(\w+)\s*:\s*([^,}\n]+)/g,
    ];
    for (const pattern of patterns) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(text)) !== null) {
        const [, key, value] = match;
        if (key && value !== undefined) {
          args[key.trim()] = this.coerceValue(value.trim());
        }
      }
    }
    return args;
  }

  private createToolCallSignature(call: PromptBasedToolCall): string {
    const sortedArgs = this.sortObjectKeys(call.arguments);
    return `${call.toolName.toLowerCase()}:${JSON.stringify(sortedArgs)}`;
  }

  private sortObjectKeys(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sortObjectKeys(item));
    } else if (obj !== null && typeof obj === "object") {
      return Object.keys(obj)
        .sort()
        .reduce((result: Record<string, any>, key) => {
          result[key] = this.sortObjectKeys(obj[key]);
          return result;
        }, {});
    }
    return obj;
  }

  static hasPartialToolCalls(text: string): boolean {
    const xmlStart = text.includes("<tool_call");
    const xmlEnd = text.includes("</tool_call>");
    if (xmlStart && !xmlEnd) {
      return true;
    }
    const markdownStart = text.includes("```tool_call");
    const markdownEnd = text.includes("```\n") || text.endsWith("```");
    if (markdownStart && !markdownEnd) {
      return true;
    }
    const openBraces = (text.match(/\{/g) || []).length;
    const closeBraces = (text.match(/\}/g) || []).length;
    if (openBraces > closeBraces) {
      return true;
    }
    return false;
  }

  resetState(): void {
    this.streamBuffer = "";
    this.completedToolCalls = [];
    this.parsingErrors = [];
  }

  getParsingErrors(): string[] {
    return [...this.parsingErrors];
  }

  getStreamBuffer(): string {
    return this.streamBuffer;
  }

  static createStreamingParser(): ToolCallParser {
    return new ToolCallParser();
  }
}
