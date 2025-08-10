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
import { ToolCallParser } from "./tool-call-parser";
import {
  PromptBasedToolCall,
  PromptBasedToolConfig,
  PromptBasedToolResult,
} from "./types";

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

  const toolDescriptions = Object.entries(toolSet.tools)
    .map(([name, tool]) => {
      const description = tool.description || name;
      // AI SDK v5: use inputSchema instead of parameters
      const inputSchema =
        (tool as any).inputSchema || (tool as any).parameters || {};

      // Extract parameter information
      const paramInfo = Object.entries(inputSchema.properties || {})
        .map(([paramName, paramDef]: [string, any]) => {
          const required = inputSchema.required?.includes(paramName)
            ? " (required)"
            : " (optional)";
          const type = paramDef.type || "any";
          const desc = paramDef.description || "";
          return `  - ${paramName} (${type})${required}: ${desc}`;
        })
        .join("\n");

      return `**${name}**: ${description}
Parameters:
${paramInfo || "  No parameters"}`;
    })
    .join("\n\n");

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
  const toolCallRegex =
    /<tool_call>\s*<tool_name>(.*?)<\/tool_name>\s*<arguments>(.*?)<\/arguments>\s*<\/tool_call>/gs;

  let match;
  let callCounter = 0;

  while (
    (match = toolCallRegex.exec(text)) !== null &&
    callCounter < DEFAULT_PROMPT_TOOL_CONFIG.maxToolCalls
  ) {
    const [fullMatch, toolName, argumentsText] = match;

    try {
      const toolNameTrimmed = toolName.trim();
      const argumentsJson = argumentsText.trim();

      let parsedArguments: Record<string, any> = {};
      if (argumentsJson) {
        try {
          parsedArguments = JSON.parse(argumentsJson);
        } catch (parseError) {
          logger.appendLine(
            `WARN: Failed to parse tool arguments for ${toolNameTrimmed}: ${parseError}`,
          );
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
 * Enhanced tool execution configuration
 */
interface ToolExecutionConfig {
  timeout: number; // milliseconds
  maxRetries: number;
  retryDelay: number; // milliseconds
  circuitBreakerThreshold: number; // failures before circuit opens
}

const DEFAULT_EXECUTION_CONFIG: ToolExecutionConfig = {
  timeout: 30000, // 30 seconds
  maxRetries: 2,
  retryDelay: 1000, // 1 second
  circuitBreakerThreshold: 5,
};

// Circuit breaker state per tool
const toolCircuitBreakers = new Map<
  string,
  {
    failures: number;
    isOpen: boolean;
    lastFailure: number;
  }
>();

/**
 * Enhanced tool execution with timeout, retries, and circuit breaker
 */
export async function executePromptToolCall(
  toolCall: PromptBasedToolCall,
  toolSet: ToolSet,
  config: Partial<ToolExecutionConfig> = {},
): Promise<PromptBasedToolResult> {
  const executionConfig = { ...DEFAULT_EXECUTION_CONFIG, ...config };
  const startTime = Date.now();

  // Validate tool call
  const validationResult = validateToolCall(toolCall);
  if (!validationResult.valid) {
    return {
      id: toolCall.id,
      toolName: toolCall.toolName,
      result: null,
      error: `Invalid tool call: ${validationResult.errors.join(", ")}`,
    };
  }

  // Check circuit breaker
  const circuitBreaker = toolCircuitBreakers.get(toolCall.toolName);
  if (circuitBreaker?.isOpen) {
    const timeSinceFailure = Date.now() - circuitBreaker.lastFailure;
    if (timeSinceFailure < 60000) {
      // 1 minute cooldown
      return {
        id: toolCall.id,
        toolName: toolCall.toolName,
        result: null,
        error: `Tool '${toolCall.toolName}' circuit breaker is open (too many failures)`,
      };
    } else {
      // Reset circuit breaker
      circuitBreaker.isOpen = false;
      circuitBreaker.failures = 0;
    }
  }

  const tool = toolSet.tools[toolCall.toolName];
  if (!tool) {
    recordToolFailure(toolCall.toolName);
    return {
      id: toolCall.id,
      toolName: toolCall.toolName,
      result: null,
      error: `Tool '${toolCall.toolName}' not found`,
    };
  }

  if (!tool.execute) {
    recordToolFailure(toolCall.toolName);
    return {
      id: toolCall.id,
      toolName: toolCall.toolName,
      result: null,
      error: `Tool '${toolCall.toolName}' has no execute function`,
    };
  }

  logger.appendLine(
    `INFO: Executing prompt-based tool call: ${toolCall.toolName} (timeout: ${executionConfig.timeout}ms)`,
  );

  // Execute with retry logic
  let lastError: Error | string | null = null;
  for (let attempt = 0; attempt <= executionConfig.maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        logger.appendLine(
          `INFO: Retrying tool ${toolCall.toolName}, attempt ${attempt + 1}/${executionConfig.maxRetries + 1}`,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, executionConfig.retryDelay),
        );
      }

      // Execute with timeout
      const result = await executeWithTimeout(
        tool.execute(toolCall.arguments, {
          toolCallId: toolCall.id,
          messages: [],
        }),
        executionConfig.timeout,
      );

      // Success - reset circuit breaker
      resetToolCircuitBreaker(toolCall.toolName);

      const executionTime = Date.now() - startTime;
      logger.appendLine(
        `INFO: Tool ${toolCall.toolName} executed successfully in ${executionTime}ms`,
      );

      const successResult = {
        id: toolCall.id,
        toolName: toolCall.toolName,
        result: result,
      };


      return successResult;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const isTimeout = lastError.message.includes("timeout");
      const isRetriable = isRetriableError(lastError);

      logger.appendLine(
        `WARN: Tool execution attempt ${attempt + 1} failed for ${toolCall.toolName}: ${lastError.message} (timeout: ${isTimeout}, retriable: ${isRetriable})`,
      );

      // Don't retry if not retriable or if it's the last attempt
      if (!isRetriable || attempt === executionConfig.maxRetries) {
        break;
      }
    }
  }

  // All attempts failed
  recordToolFailure(toolCall.toolName);
  const executionTime = Date.now() - startTime;

  const failureResult = {
    id: toolCall.id,
    toolName: toolCall.toolName,
    result: null,
    error: `Tool execution failed after ${executionConfig.maxRetries + 1} attempts (${executionTime}ms): ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  };


  return failureResult;
}

/**
 * Execute a promise with timeout
 */
function executeWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Tool execution timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * Determine if an error is retriable
 */
function isRetriableError(error: Error | string): boolean {
  const errorMessage =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();

  // Network/connection errors are usually retriable
  const retriablePatterns = [
    "network",
    "connection",
    "econnreset",
    "enotfound",
    "timeout",
    "rate limit",
    "temporary",
    "server error",
    "500",
    "502",
    "503",
    "504",
  ];

  // Authentication/authorization errors are not retriable
  const nonRetriablePatterns = [
    "unauthorized",
    "forbidden",
    "401",
    "403",
    "invalid api key",
    "permission denied",
    "authentication",
  ];

  // Check non-retriable first
  for (const pattern of nonRetriablePatterns) {
    if (errorMessage.includes(pattern)) {
      return false;
    }
  }

  // Check retriable patterns
  for (const pattern of retriablePatterns) {
    if (errorMessage.includes(pattern)) {
      return true;
    }
  }

  // Default: don't retry unknown errors
  return false;
}

/**
 * Record a tool failure for circuit breaker
 */
function recordToolFailure(toolName: string): void {
  const circuitBreaker = toolCircuitBreakers.get(toolName) || {
    failures: 0,
    isOpen: false,
    lastFailure: 0,
  };

  circuitBreaker.failures += 1;
  circuitBreaker.lastFailure = Date.now();

  if (
    circuitBreaker.failures >= DEFAULT_EXECUTION_CONFIG.circuitBreakerThreshold
  ) {
    circuitBreaker.isOpen = true;
    logger.appendLine(
      `WARN: Circuit breaker opened for tool ${toolName} after ${circuitBreaker.failures} failures`,
    );
  }

  toolCircuitBreakers.set(toolName, circuitBreaker);
}

/**
 * Reset circuit breaker for a tool
 */
function resetToolCircuitBreaker(toolName: string): void {
  const circuitBreaker = toolCircuitBreakers.get(toolName);
  if (circuitBreaker && circuitBreaker.failures > 0) {
    logger.appendLine(
      `INFO: Resetting circuit breaker for tool ${toolName} after successful execution`,
    );
    circuitBreaker.failures = 0;
    circuitBreaker.isOpen = false;
  }
}

/**
 * Validate tool call structure and arguments
 */
function validateToolCall(toolCall: PromptBasedToolCall): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!toolCall.toolName || typeof toolCall.toolName !== "string") {
    errors.push("Tool name is required and must be a string");
  }

  if (!toolCall.id || typeof toolCall.id !== "string") {
    errors.push("Tool call ID is required and must be a string");
  }

  if (toolCall.arguments === null || toolCall.arguments === undefined) {
    errors.push("Arguments cannot be null or undefined");
  } else if (
    typeof toolCall.arguments !== "object" ||
    Array.isArray(toolCall.arguments)
  ) {
    errors.push("Arguments must be an object");
  }

  // Check for circular references
  try {
    JSON.stringify(toolCall.arguments);
  } catch {
    errors.push("Arguments contain circular references");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get circuit breaker statistics
 */
export function getToolExecutionStats(): Record<
  string,
  {
    failures: number;
    isOpen: boolean;
    lastFailure: number;
  }
> {
  const stats: Record<string, any> = {};
  for (const [toolName, breaker] of toolCircuitBreakers) {
    stats[toolName] = {
      failures: breaker.failures,
      isOpen: breaker.isOpen,
      lastFailure: breaker.lastFailure,
    };
  }
  return stats;
}

/**
 * Enhanced tool calls processing with batching and concurrency control
 */
export async function processPromptBasedToolCalls(
  text: string,
  toolSet: ToolSet,
  onToolCall?: (toolCall: PromptBasedToolCall) => void,
  onToolResult?: (result: PromptBasedToolResult) => void,
  options: {
    maxConcurrency?: number;
    executionConfig?: Partial<ToolExecutionConfig>;
    enableParallelExecution?: boolean;
  } = {},
): Promise<{
  updatedText: string;
  toolCalls: PromptBasedToolCall[];
  results: PromptBasedToolResult[];
  executionTime: number;
  errors: string[];
}> {
  const startTime = Date.now();
  const {
    maxConcurrency = 3,
    executionConfig = {},
    enableParallelExecution = false,
  } = options;

  // Use the enhanced ToolCallParser
  const parseResult = ToolCallParser.parseToolCalls(text, 15, false);
  const toolCalls = parseResult.toolCalls;
  const parseErrors = parseResult.errors;
  const results: PromptBasedToolResult[] = [];
  const executionErrors: string[] = [...parseErrors];

  if (toolCalls.length === 0) {
    return {
      updatedText: text,
      toolCalls,
      results,
      executionTime: Date.now() - startTime,
      errors: parseErrors,
    };
  }

  logger.appendLine(
    `INFO: Found ${toolCalls.length} prompt-based tool calls (parallel: ${enableParallelExecution})`,
  );

  try {
    if (enableParallelExecution && toolCalls.length > 1) {
      // Execute tool calls with controlled concurrency
      results.push(
        ...(await executeToolCallsBatch(toolCalls, toolSet, {
          maxConcurrency,
          executionConfig,
          onToolCall,
          onToolResult,
        })),
      );
    } else {
      // Execute tool calls sequentially (safer default)
      for (const toolCall of toolCalls) {
        if (onToolCall) {
          onToolCall(toolCall);
        }

        const result = await executePromptToolCall(
          toolCall,
          toolSet,
          executionConfig,
        );
        results.push(result);

        if (result.error) {
          executionErrors.push(`Tool ${toolCall.toolName}: ${result.error}`);
        }

        if (onToolResult) {
          onToolResult(result);
        }
      }
    }
  } catch (error) {
    const errorMsg = `Batch execution failed: ${error instanceof Error ? error.message : String(error)}`;
    logger.appendLine(`ERROR: ${errorMsg}`);
    executionErrors.push(errorMsg);
  }

  const executionTime = Date.now() - startTime;
  const successCount = results.filter((r) => !r.error).length;
  const failureCount = results.length - successCount;

  logger.appendLine(
    `INFO: Tool execution completed in ${executionTime}ms - ${successCount} success, ${failureCount} failed`,
  );

  return {
    updatedText: text,
    toolCalls,
    results,
    executionTime,
    errors: executionErrors,
  };
}

/**
 * Execute tool calls in batches with concurrency control
 */
async function executeToolCallsBatch(
  toolCalls: PromptBasedToolCall[],
  toolSet: ToolSet,
  options: {
    maxConcurrency: number;
    executionConfig: Partial<ToolExecutionConfig>;
    onToolCall?: (toolCall: PromptBasedToolCall) => void;
    onToolResult?: (result: PromptBasedToolResult) => void;
  },
): Promise<PromptBasedToolResult[]> {
  const { maxConcurrency, executionConfig, onToolCall, onToolResult } = options;
  const results: PromptBasedToolResult[] = [];
  const executing: Promise<void>[] = [];

  for (const toolCall of toolCalls) {
    // Wait if we've reached max concurrency
    if (executing.length >= maxConcurrency) {
      await Promise.race(executing);
    }

    const executePromise = (async () => {
      try {
        if (onToolCall) {
          onToolCall(toolCall);
        }

        const result = await executePromptToolCall(
          toolCall,
          toolSet,
          executionConfig,
        );
        results.push(result);

        if (onToolResult) {
          onToolResult(result);
        }
      } catch (error) {
        logger.appendLine(
          `ERROR: Batch execution failed for ${toolCall.toolName}: ${error}`,
        );
        results.push({
          id: toolCall.id,
          toolName: toolCall.toolName,
          result: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();

    executing.push(executePromise);

    // Clean up completed promises
    executePromise.finally(() => {
      const index = executing.indexOf(executePromise);
      if (index > -1) {
        executing.splice(index, 1);
      }
    });
  }

  // Wait for all remaining executions to complete
  await Promise.all(executing);

  return results;
}
