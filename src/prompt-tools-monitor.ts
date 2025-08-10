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
import { PromptBasedToolCall, PromptBasedToolResult } from "./types";

/**
 * Monitoring metrics for prompt-based tools
 */
interface ToolMetrics {
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  totalExecutionTime: number;
  averageExecutionTime: number;
  maxExecutionTime: number;
  minExecutionTime: number;
  lastExecuted: number;
  lastSuccess: number;
  lastFailure: number;
  errorTypes: Record<string, number>;
  recentExecutions: ToolExecution[];
}

interface ToolExecution {
  id: string;
  timestamp: number;
  executionTime: number;
  success: boolean;
  error?: string;
  arguments: Record<string, any>;
}

interface ParsingMetrics {
  totalParseAttempts: number;
  successfulParses: number;
  failedParses: number;
  averageParseTime: number;
  commonErrors: Record<string, number>;
  recentParses: {
    timestamp: number;
    success: boolean;
    parseTime: number;
    toolCallsFound: number;
    errors: string[];
  }[];
}

interface SystemMetrics {
  uptime: number;
  totalSessions: number;
  activeSessions: number;
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  performanceMarks: {
    averageResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
  };
}

/**
 * Comprehensive monitoring and diagnostics for prompt-based tools
 */
class PromptToolsMonitor {
  private static instance: PromptToolsMonitor;
  private toolMetrics = new Map<string, ToolMetrics>();
  private parsingMetrics: ParsingMetrics;
  private systemMetrics: SystemMetrics;
  private startTime = Date.now();
  private responseTimes: number[] = [];
  private maxRecentExecutions = 50;
  private maxRecentParses = 50;
  private maxResponseTimeHistory = 1000;

  private constructor() {
    this.parsingMetrics = {
      totalParseAttempts: 0,
      successfulParses: 0,
      failedParses: 0,
      averageParseTime: 0,
      commonErrors: {},
      recentParses: [],
    };

    this.systemMetrics = {
      uptime: 0,
      totalSessions: 0,
      activeSessions: 0,
      memoryUsage: { heapUsed: 0, heapTotal: 0, external: 0 },
      performanceMarks: {
        averageResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
      },
    };
  }

  static getInstance(): PromptToolsMonitor {
    if (!PromptToolsMonitor.instance) {
      PromptToolsMonitor.instance = new PromptToolsMonitor();
    }
    return PromptToolsMonitor.instance;
  }

  /**
   * Record a tool execution
   */
  recordToolExecution(
    toolName: string,
    toolCall: PromptBasedToolCall,
    result: PromptBasedToolResult,
    executionTime: number,
  ): void {
    const metrics = this.getOrCreateToolMetrics(toolName);
    const execution: ToolExecution = {
      id: toolCall.id,
      timestamp: Date.now(),
      executionTime,
      success: !result.error,
      error: result.error,
      arguments: toolCall.arguments,
    };

    // Update counters
    metrics.totalExecutions += 1;
    if (result.error) {
      metrics.failureCount += 1;
      metrics.lastFailure = execution.timestamp;

      // Categorize error types
      const errorType = this.categorizeError(result.error);
      metrics.errorTypes[errorType] = (metrics.errorTypes[errorType] || 0) + 1;

      if (result.error.toLowerCase().includes("timeout")) {
        metrics.timeoutCount += 1;
      }
    } else {
      metrics.successCount += 1;
      metrics.lastSuccess = execution.timestamp;
    }

    // Update timing metrics
    metrics.totalExecutionTime += executionTime;
    metrics.averageExecutionTime =
      metrics.totalExecutionTime / metrics.totalExecutions;
    metrics.maxExecutionTime = Math.max(
      metrics.maxExecutionTime,
      executionTime,
    );
    metrics.minExecutionTime = Math.min(
      metrics.minExecutionTime || executionTime,
      executionTime,
    );
    metrics.lastExecuted = execution.timestamp;

    // Add to recent executions
    metrics.recentExecutions.unshift(execution);
    if (metrics.recentExecutions.length > this.maxRecentExecutions) {
      metrics.recentExecutions = metrics.recentExecutions.slice(
        0,
        this.maxRecentExecutions,
      );
    }

    // Update system response times
    this.responseTimes.unshift(executionTime);
    if (this.responseTimes.length > this.maxResponseTimeHistory) {
      this.responseTimes = this.responseTimes.slice(
        0,
        this.maxResponseTimeHistory,
      );
    }

    this.updateSystemMetrics();
  }

  /**
   * Record parsing metrics
   */
  recordParsingAttempt(
    success: boolean,
    parseTime: number,
    toolCallsFound: number,
    errors: string[] = [],
  ): void {
    this.parsingMetrics.totalParseAttempts += 1;

    if (success) {
      this.parsingMetrics.successfulParses += 1;
    } else {
      this.parsingMetrics.failedParses += 1;
    }

    // Update average parse time
    const totalParseTime =
      this.parsingMetrics.averageParseTime *
      (this.parsingMetrics.totalParseAttempts - 1) +
      parseTime;
    this.parsingMetrics.averageParseTime =
      totalParseTime / this.parsingMetrics.totalParseAttempts;

    // Track common errors
    for (const error of errors) {
      const errorType = this.categorizeError(error);
      this.parsingMetrics.commonErrors[errorType] =
        (this.parsingMetrics.commonErrors[errorType] || 0) + 1;
    }

    // Add to recent parses
    this.parsingMetrics.recentParses.unshift({
      timestamp: Date.now(),
      success,
      parseTime,
      toolCallsFound,
      errors,
    });

    if (this.parsingMetrics.recentParses.length > this.maxRecentParses) {
      this.parsingMetrics.recentParses = this.parsingMetrics.recentParses.slice(
        0,
        this.maxRecentParses,
      );
    }
  }

  /**
   * Get comprehensive metrics report
   */
  getMetricsReport(): {
    tools: Record<string, ToolMetrics>;
    parsing: ParsingMetrics;
    system: SystemMetrics;
    summary: {
      totalToolExecutions: number;
      overallSuccessRate: number;
      averageResponseTime: number;
      mostUsedTools: string[];
      mostFailedTools: string[];
      commonIssues: string[];
    };
  } {
    this.updateSystemMetrics();

    const toolsMap: Record<string, ToolMetrics> = {};
    for (const [name, metrics] of this.toolMetrics) {
      toolsMap[name] = { ...metrics };
    }

    const totalExecutions = Array.from(this.toolMetrics.values()).reduce(
      (sum, metrics) => sum + metrics.totalExecutions,
      0,
    );
    const totalSuccesses = Array.from(this.toolMetrics.values()).reduce(
      (sum, metrics) => sum + metrics.successCount,
      0,
    );
    const overallSuccessRate =
      totalExecutions > 0 ? (totalSuccesses / totalExecutions) * 100 : 0;

    // Most used tools
    const mostUsedTools = Array.from(this.toolMetrics.entries())
      .sort((a, b) => b[1].totalExecutions - a[1].totalExecutions)
      .slice(0, 5)
      .map(([name]) => name);

    // Most failed tools
    const mostFailedTools = Array.from(this.toolMetrics.entries())
      .filter(([, metrics]) => metrics.failureCount > 0)
      .sort((a, b) => b[1].failureCount - a[1].failureCount)
      .slice(0, 5)
      .map(([name]) => name);

    // Common issues
    const allErrors: Record<string, number> = {};
    for (const metrics of this.toolMetrics.values()) {
      for (const [error, count] of Object.entries(metrics.errorTypes)) {
        allErrors[error] = (allErrors[error] || 0) + count;
      }
    }
    const commonIssues = Object.entries(allErrors)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([error]) => error);

    return {
      tools: toolsMap,
      parsing: { ...this.parsingMetrics },
      system: { ...this.systemMetrics },
      summary: {
        totalToolExecutions: totalExecutions,
        overallSuccessRate,
        averageResponseTime:
          this.systemMetrics.performanceMarks.averageResponseTime,
        mostUsedTools,
        mostFailedTools,
        commonIssues,
      },
    };
  }

  /**
   * Get health status
   */
  getHealthStatus(): {
    status: "healthy" | "warning" | "critical";
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check success rates
    for (const [toolName, metrics] of this.toolMetrics) {
      const successRate =
        (metrics.successCount / metrics.totalExecutions) * 100;
      if (successRate < 50 && metrics.totalExecutions > 5) {
        issues.push(
          `Tool ${toolName} has low success rate: ${successRate.toFixed(1)}%`,
        );
        recommendations.push(
          `Review ${toolName} implementation and error handling`,
        );
      }

      // Check for timeouts
      if (
        metrics.timeoutCount > 0 &&
        metrics.timeoutCount / metrics.totalExecutions > 0.2
      ) {
        issues.push(
          `Tool ${toolName} has frequent timeouts: ${metrics.timeoutCount}/${metrics.totalExecutions}`,
        );
        recommendations.push(
          `Increase timeout or optimize ${toolName} performance`,
        );
      }
    }

    // Check parsing success rate
    const parseSuccessRate =
      (this.parsingMetrics.successfulParses /
        this.parsingMetrics.totalParseAttempts) *
      100;
    if (parseSuccessRate < 80 && this.parsingMetrics.totalParseAttempts > 10) {
      issues.push(`Low parsing success rate: ${parseSuccessRate.toFixed(1)}%`);
      recommendations.push(
        "Review tool call formats and improve parsing strategies",
      );
    }

    // Check response times
    const avgResponseTime =
      this.systemMetrics.performanceMarks.averageResponseTime;
    if (avgResponseTime > 10000) {
      // 10 seconds
      issues.push(
        `High average response time: ${avgResponseTime.toFixed(0)}ms`,
      );
      recommendations.push(
        "Optimize tool execution performance and consider parallel execution",
      );
    }

    let status: "healthy" | "warning" | "critical" = "healthy";
    if (issues.length > 0) {
      status = issues.length > 3 ? "critical" : "warning";
    }

    return {
      status,
      issues,
      recommendations,
    };
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    this.toolMetrics.clear();
    this.parsingMetrics = {
      totalParseAttempts: 0,
      successfulParses: 0,
      failedParses: 0,
      averageParseTime: 0,
      commonErrors: {},
      recentParses: [],
    };
    this.responseTimes = [];
    this.startTime = Date.now();
    logger.appendLine("INFO: Prompt tools metrics have been reset");
  }

  /**
   * Export metrics to JSON
   */
  exportMetrics(): string {
    return JSON.stringify(this.getMetricsReport(), null, 2);
  }

  private getOrCreateToolMetrics(toolName: string): ToolMetrics {
    if (!this.toolMetrics.has(toolName)) {
      this.toolMetrics.set(toolName, {
        totalExecutions: 0,
        successCount: 0,
        failureCount: 0,
        timeoutCount: 0,
        totalExecutionTime: 0,
        averageExecutionTime: 0,
        maxExecutionTime: 0,
        minExecutionTime: 0,
        lastExecuted: 0,
        lastSuccess: 0,
        lastFailure: 0,
        errorTypes: {},
        recentExecutions: [],
      });
    }
    return this.toolMetrics.get(toolName)!;
  }

  private categorizeError(error: string): string {
    const errorLower = error.toLowerCase();

    if (errorLower.includes("timeout")) {
      return "timeout";
    }
    if (errorLower.includes("network") || errorLower.includes("connection")) {
      return "network";
    }
    if (
      errorLower.includes("auth") ||
      errorLower.includes("unauthorized") ||
      errorLower.includes("forbidden")
    ) {
      return "authentication";
    }
    if (errorLower.includes("not found") || errorLower.includes("404")) {
      return "not_found";
    }
    if (errorLower.includes("rate limit")) {
      return "rate_limit";
    }
    if (
      errorLower.includes("parse") ||
      errorLower.includes("json") ||
      errorLower.includes("syntax")
    ) {
      return "parsing";
    }
    if (errorLower.includes("validation")) {
      return "validation";
    }
    if (
      errorLower.includes("server") ||
      errorLower.includes("500") ||
      errorLower.includes("502") ||
      errorLower.includes("503")
    ) {
      return "server_error";
    }

    return "unknown";
  }

  private updateSystemMetrics(): void {
    this.systemMetrics.uptime = Date.now() - this.startTime;

    // Update memory usage
    if (typeof process !== "undefined" && process.memoryUsage) {
      const memUsage = process.memoryUsage();
      this.systemMetrics.memoryUsage = {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
      };
    }

    // Update performance marks
    if (this.responseTimes.length > 0) {
      const sorted = [...this.responseTimes].sort((a, b) => a - b);
      this.systemMetrics.performanceMarks.averageResponseTime =
        this.responseTimes.reduce((sum, time) => sum + time, 0) /
        this.responseTimes.length;
      this.systemMetrics.performanceMarks.p95ResponseTime =
        sorted[Math.floor(sorted.length * 0.95)];
      this.systemMetrics.performanceMarks.p99ResponseTime =
        sorted[Math.floor(sorted.length * 0.99)];
    }
  }
}

/**
 * Global monitor instance
 */
export const promptToolsMonitor = PromptToolsMonitor.getInstance();

/**
 * Convenience functions for monitoring
 */
export function recordToolExecution(
  toolName: string,
  toolCall: PromptBasedToolCall,
  result: PromptBasedToolResult,
  executionTime: number,
): void {
  promptToolsMonitor.recordToolExecution(
    toolName,
    toolCall,
    result,
    executionTime,
  );
}

export function recordParsingAttempt(
  success: boolean,
  parseTime: number,
  toolCallsFound: number,
  errors: string[] = [],
): void {
  promptToolsMonitor.recordParsingAttempt(
    success,
    parseTime,
    toolCallsFound,
    errors,
  );
}

export function getToolsHealthStatus() {
  return promptToolsMonitor.getHealthStatus();
}

export function getToolsMetricsReport() {
  return promptToolsMonitor.getMetricsReport();
}

export function resetToolsMetrics() {
  promptToolsMonitor.resetMetrics();
}

export function exportToolsMetrics() {
  return promptToolsMonitor.exportMetrics();
}
