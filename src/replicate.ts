/* eslint-disable @typescript-eslint/naming-convention */

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

import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2StreamPart,
} from "@ai-sdk/provider";
import { logger } from "./logger";

interface ReplicateConfig {
  apiToken: string;
  baseURL?: string;
}

interface ReplicatePredictionResponse {
  id: string;
  model: string;
  version?: string;
  input: Record<string, unknown>;
  output?: string[] | string | null;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  error?: string;
  urls?: {
    get?: string;
    stream?: string;
    cancel?: string;
  };
}

/**
 * Custom Replicate Language Model implementation
 * This bypasses the @ai-sdk/replicate package which doesn't support language models
 */
class ReplicateLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = "v2" as const;
  readonly provider = "replicate";
  readonly modelId: string;
  readonly supportedUrls: Record<string, RegExp[]> = {};

  private apiToken: string;
  private baseURL: string;

  constructor(modelId: string, config: ReplicateConfig) {
    this.modelId = modelId;
    this.apiToken = config.apiToken;
    this.baseURL = config.baseURL || "https://api.replicate.com/v1";
  }

  private formatPrompt(
    messages: LanguageModelV2CallOptions["prompt"],
  ): string {
    const parts: string[] = [];

    for (const message of messages) {
      if (message.role === "system") {
        parts.push(`System: ${message.content}\n`);
      } else if (message.role === "user") {
        const textParts = message.content
          .filter((part) => part.type === "text")
          .map((part) => part.text);
        parts.push(`User: ${textParts.join(" ")}\n`);
      } else if (message.role === "assistant") {
        const textParts = message.content
          .filter((part) => part.type === "text")
          .map((part) => (part as { type: "text"; text: string }).text);
        if (textParts.length > 0) {
          parts.push(`Assistant: ${textParts.join(" ")}\n`);
        }
      }
    }

    parts.push("Assistant:");
    return parts.join("");
  }

  private buildInput(
    options: LanguageModelV2CallOptions,
  ): Record<string, unknown> {
    const prompt = this.formatPrompt(options.prompt);
    const input: Record<string, unknown> = {
      prompt,
    };

    if (options.maxOutputTokens) {
      input.max_tokens = options.maxOutputTokens;
      input.max_new_tokens = options.maxOutputTokens;
    }

    if (options.temperature !== undefined) {
      input.temperature = options.temperature;
    }

    if (options.topP !== undefined) {
      input.top_p = options.topP;
    }

    if (options.topK !== undefined) {
      input.top_k = options.topK;
    }

    if (options.stopSequences && options.stopSequences.length > 0) {
      input.stop_sequences = options.stopSequences.join(",");
    }

    return input;
  }

  async doGenerate(
    options: LanguageModelV2CallOptions,
  ): Promise<Awaited<ReturnType<LanguageModelV2["doGenerate"]>>> {
    const input = this.buildInput(options);

    logger.appendLine(
      `INFO: Replicate doGenerate - model: ${this.modelId}, input: ${JSON.stringify(input)}`,
    );

    // Create prediction
    const createResponse = await fetch(
      `${this.baseURL}/models/${this.modelId}/predictions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
          Prefer: "wait",
        },
        body: JSON.stringify({ input }),
        signal: options.abortSignal,
      },
    );

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(
        `Replicate API error: ${createResponse.status} ${createResponse.statusText} - ${errorText}`,
      );
    }

    let prediction: ReplicatePredictionResponse =
      await createResponse.json();

    // Poll for completion if not using Prefer: wait
    while (
      prediction.status === "starting" ||
      prediction.status === "processing"
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (options.abortSignal?.aborted) {
        throw new Error("Request aborted");
      }

      const pollResponse = await fetch(prediction.urls?.get || "", {
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
        },
        signal: options.abortSignal,
      });

      if (!pollResponse.ok) {
        throw new Error(`Replicate polling error: ${pollResponse.status}`);
      }

      prediction = await pollResponse.json();
    }

    if (prediction.status === "failed") {
      throw new Error(`Replicate prediction failed: ${prediction.error}`);
    }

    if (prediction.status === "canceled") {
      throw new Error("Replicate prediction was canceled");
    }

    // Extract output text
    let outputText = "";
    if (Array.isArray(prediction.output)) {
      outputText = prediction.output.join("");
    } else if (typeof prediction.output === "string") {
      outputText = prediction.output;
    }

    logger.appendLine(
      `INFO: Replicate doGenerate completed - output length: ${outputText.length}`,
    );

    return {
      content: [{ type: "text", text: outputText }],
      finishReason: "stop",
      usage: {
        inputTokens: undefined,
        outputTokens: undefined,
        totalTokens: undefined,
      },
      warnings: [],
    };
  }

  async doStream(
    options: LanguageModelV2CallOptions,
  ): Promise<Awaited<ReturnType<LanguageModelV2["doStream"]>>> {
    const input = this.buildInput(options);

    logger.appendLine(
      `INFO: Replicate doStream - model: ${this.modelId}, input: ${JSON.stringify(input)}`,
    );

    // Create prediction with streaming
    const createResponse = await fetch(
      `${this.baseURL}/models/${this.modelId}/predictions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input, stream: true }),
        signal: options.abortSignal,
      },
    );

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(
        `Replicate API error: ${createResponse.status} ${createResponse.statusText} - ${errorText}`,
      );
    }

    const prediction: ReplicatePredictionResponse =
      await createResponse.json();

    if (!prediction.urls?.stream) {
      // Fallback to polling if streaming is not available
      return this.doStreamWithPolling(prediction, options);
    }

    // Create a ReadableStream that consumes the SSE stream
    const streamURL = prediction.urls.stream;
    const apiToken = this.apiToken;
    const abortSignal = options.abortSignal;
    const textId = `text-${Date.now()}`;

    const stream = new ReadableStream<LanguageModelV2StreamPart>({
      async start(controller) {
        try {
          // Emit stream start
          controller.enqueue({
            type: "stream-start",
            warnings: [],
          });

          // Emit text start
          controller.enqueue({
            type: "text-start",
            id: textId,
          });

          const response = await fetch(streamURL, {
            headers: {
              Authorization: `Bearer ${apiToken}`,
              Accept: "text/event-stream",
            },
            signal: abortSignal,
          });

          if (!response.ok) {
            throw new Error(`Stream error: ${response.status}`);
          }

          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error("No response body");
          }

          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            buffer += decoder.decode(value, { stream: true });

            // Parse SSE events
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);

                if (data === "[DONE]") {
                  continue;
                }

                // Replicate sends the text directly in the data field for streaming
                if (data.trim()) {
                  controller.enqueue({
                    type: "text-delta",
                    id: textId,
                    delta: data,
                  });
                }
              } else if (line.startsWith("event: ")) {
                const eventType = line.slice(7).trim();
                if (eventType === "done") {
                  break;
                }
              }
            }
          }

          // Emit text end
          controller.enqueue({
            type: "text-end",
            id: textId,
          });

          // Emit finish
          controller.enqueue({
            type: "finish",
            finishReason: "stop",
            usage: {
              inputTokens: undefined,
              outputTokens: undefined,
              totalTokens: undefined,
            },
          });

          controller.close();
        } catch (error) {
          logger.appendLine(`ERROR: Replicate stream error: ${error}`);
          controller.error(error);
        }
      },
    });

    return {
      stream,
      request: { body: { input, stream: true } },
    };
  }

  private async doStreamWithPolling(
    prediction: ReplicatePredictionResponse,
    options: LanguageModelV2CallOptions,
  ): Promise<Awaited<ReturnType<LanguageModelV2["doStream"]>>> {
    const apiToken = this.apiToken;
    const abortSignal = options.abortSignal;
    const pollUrl = prediction.urls?.get || "";
    const textId = `text-${Date.now()}`;

    const stream = new ReadableStream<LanguageModelV2StreamPart>({
      async start(controller) {
        try {
          // Emit stream start
          controller.enqueue({
            type: "stream-start",
            warnings: [],
          });

          // Emit text start
          controller.enqueue({
            type: "text-start",
            id: textId,
          });

          let currentPrediction = prediction;
          let lastOutput = "";

          while (
            currentPrediction.status === "starting" ||
            currentPrediction.status === "processing"
          ) {
            await new Promise((resolve) => setTimeout(resolve, 500));

            if (abortSignal?.aborted) {
              throw new Error("Request aborted");
            }

            const pollResponse = await fetch(pollUrl, {
              headers: {
                Authorization: `Bearer ${apiToken}`,
              },
              signal: abortSignal,
            });

            if (!pollResponse.ok) {
              throw new Error(`Polling error: ${pollResponse.status}`);
            }

            currentPrediction = await pollResponse.json();

            // Extract any new output
            let currentOutput = "";
            if (Array.isArray(currentPrediction.output)) {
              currentOutput = currentPrediction.output.join("");
            } else if (typeof currentPrediction.output === "string") {
              currentOutput = currentPrediction.output;
            }

            // Emit delta for new content
            if (currentOutput.length > lastOutput.length) {
              const delta = currentOutput.slice(lastOutput.length);
              controller.enqueue({
                type: "text-delta",
                id: textId,
                delta,
              });
              lastOutput = currentOutput;
            }
          }

          if (currentPrediction.status === "failed") {
            throw new Error(
              `Prediction failed: ${currentPrediction.error}`,
            );
          }

          // Emit text end
          controller.enqueue({
            type: "text-end",
            id: textId,
          });

          // Emit finish
          controller.enqueue({
            type: "finish",
            finishReason:
              currentPrediction.status === "canceled" ? "other" : "stop",
            usage: {
              inputTokens: undefined,
              outputTokens: undefined,
              totalTokens: undefined,
            },
          });

          controller.close();
        } catch (error) {
          logger.appendLine(`ERROR: Replicate polling stream error: ${error}`);
          controller.error(error);
        }
      },
    });

    return {
      stream,
      request: { body: { input: prediction.input } },
    };
  }
}

/**
 * Creates a Replicate provider for language models
 */
export function createReplicateProvider(config: ReplicateConfig) {
  return {
    languageModel(modelId: string): LanguageModelV2 {
      return new ReplicateLanguageModel(modelId, config);
    },
  };
}
