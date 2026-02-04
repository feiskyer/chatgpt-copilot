import { beforeEach, describe, expect, it, vi } from "vitest";

const openaiMocks = vi.hoisted(() => {
  const openaiChat = vi.fn((modelId: string) => ({ id: `chat:${modelId}` }));
  const openaiResponses = vi.fn((modelId: string) => ({
    id: `responses:${modelId}`,
  }));
  const createOpenAI = vi.fn(() => ({
    chat: openaiChat,
    responses: openaiResponses,
  }));
  return { openaiChat, openaiResponses, createOpenAI };
});

const azureMocks = vi.hoisted(() => {
  const azureChat = vi.fn((modelId: string) => ({ id: `chat:${modelId}` }));
  const azureResponses = vi.fn((modelId: string) => ({
    id: `responses:${modelId}`,
  }));
  const createAzure = vi.fn(() => ({
    chat: azureChat,
    responses: azureResponses,
  }));
  return { azureChat, azureResponses, createAzure };
});

const anthropicMocks = vi.hoisted(() => {
  const anthropicLanguageModel = vi.fn((modelId: string) => ({
    id: `claude:${modelId}`,
  }));
  const createAnthropic = vi.fn(() => ({
    languageModel: anthropicLanguageModel,
  }));
  return { anthropicLanguageModel, createAnthropic };
});

const googleMocks = vi.hoisted(() => {
  const geminiModel = vi.fn((modelId: string) => ({
    id: `gemini:${modelId}`,
  }));
  const createGoogleGenerativeAI = vi.fn(() => geminiModel);
  return { geminiModel, createGoogleGenerativeAI };
});

const aiMocks = vi.hoisted(() => {
  const wrapLanguageModel = vi.fn(({ model }: { model: unknown }) => ({
    wrapped: model,
  }));
  const extractReasoningMiddleware = vi.fn(() => "middleware");
  return { wrapLanguageModel, extractReasoningMiddleware };
});

vi.mock("@ai-sdk/openai", () => ({ createOpenAI: openaiMocks.createOpenAI }));
vi.mock("@ai-sdk/azure", () => ({ createAzure: azureMocks.createAzure }));
vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: anthropicMocks.createAnthropic,
}));
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: googleMocks.createGoogleGenerativeAI,
}));
vi.mock("ai", async () => {
  const actual = await vi.importActual<any>("ai");
  return {
    ...actual,
    wrapLanguageModel: aiMocks.wrapLanguageModel,
    extractReasoningMiddleware: aiMocks.extractReasoningMiddleware,
  };
});

import { initClaudeModel, initGeminiModel } from "../../llms";
import { initGptModel } from "../../openai";

describe("Provider initialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses OpenAI chat when enableResponsesAPI is false", async () => {
    const provider: any = { model: "gpt-4o" };
    const config: any = {
      provider: "OpenAI",
      apiKey: "test-key",
      apiBaseUrl: "https://api.openai.com/v1",
      organization: "",
      enableResponsesAPI: false,
      isReasoning: false,
    };

    await initGptModel(provider, config);

    expect(openaiMocks.createOpenAI).toHaveBeenCalled();
    expect(openaiMocks.openaiChat).toHaveBeenCalledWith("gpt-4o");
    expect(openaiMocks.openaiResponses).not.toHaveBeenCalled();
  });

  it("uses OpenAI responses when enableResponsesAPI is true", async () => {
    const provider: any = { model: "gpt-4o" };
    const config: any = {
      provider: "OpenAI",
      apiKey: "test-key",
      apiBaseUrl: "https://api.openai.com/v1",
      organization: "",
      enableResponsesAPI: true,
      isReasoning: false,
    };

    await initGptModel(provider, config);

    expect(openaiMocks.openaiResponses).toHaveBeenCalledWith("gpt-4o");
    expect(openaiMocks.openaiChat).not.toHaveBeenCalled();
  });

  it("wraps OpenAI reasoning models with middleware", async () => {
    const provider: any = { reasoningModel: "o3-mini" };
    const config: any = {
      provider: "OpenAI",
      apiKey: "test-key",
      apiBaseUrl: "https://api.openai.com/v1",
      organization: "",
      enableResponsesAPI: true,
      isReasoning: true,
    };

    await initGptModel(provider, config);

    expect(openaiMocks.openaiResponses).toHaveBeenCalledWith("o3-mini");
    expect(aiMocks.wrapLanguageModel).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { id: "responses:o3-mini" },
      }),
    );
  });

  it("uses Azure chat when enableResponsesAPI is false", async () => {
    const provider: any = { model: "gpt-4o" };
    const config: any = {
      provider: "OpenAI",
      apiKey: "test-key",
      apiBaseUrl: "https://my-resource.openai.azure.com/openai/deployments/foo",
      organization: "",
      enableResponsesAPI: false,
      isReasoning: false,
    };

    await initGptModel(provider, config);

    expect(azureMocks.createAzure).toHaveBeenCalled();
    expect(azureMocks.azureChat).toHaveBeenCalledWith("foo");
    expect(azureMocks.azureResponses).not.toHaveBeenCalled();
  });

  it("uses Azure responses when enableResponsesAPI is true", async () => {
    const provider: any = { model: "gpt-4o" };
    const config: any = {
      provider: "OpenAI",
      apiKey: "test-key",
      apiBaseUrl: "https://my-resource.openai.azure.com/openai/deployments/foo",
      organization: "",
      enableResponsesAPI: true,
      isReasoning: false,
    };

    await initGptModel(provider, config);

    expect(azureMocks.azureResponses).toHaveBeenCalledWith("foo");
    expect(azureMocks.azureChat).not.toHaveBeenCalled();
  });

  it("falls back to Anthropic default base URL", async () => {
    const provider: any = {};
    const config: any = {
      provider: "Anthropic",
      apiKey: "test-key",
      apiBaseUrl: "",
      isReasoning: false,
    };

    await initClaudeModel(provider, config);

    expect(anthropicMocks.createAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "https://api.anthropic.com/v1",
      }),
    );
  });

  it("falls back to Gemini default base URL", async () => {
    const provider: any = {};
    const config: any = {
      provider: "Google",
      apiKey: "test-key",
      apiBaseUrl: "",
      isReasoning: false,
    };

    await initGeminiModel(provider, config);

    expect(googleMocks.createGoogleGenerativeAI).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "https://generativelanguage.googleapis.com/v1beta",
      }),
    );
  });
});
