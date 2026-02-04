import { beforeEach, describe, expect, it, vi } from "vitest";

const googleMocks = vi.hoisted(() => ({
  googleSearch: vi.fn(() => "google-search-tool"),
  urlContext: vi.fn(() => "url-context-tool"),
}));

const anthropicMocks = vi.hoisted(() => ({
  webSearch: vi.fn(() => "anthropic-web-search-tool"),
}));

vi.mock("@ai-sdk/google", () => ({
  google: {
    tools: {
      googleSearch: googleMocks.googleSearch,
      urlContext: googleMocks.urlContext,
    },
  },
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: {
    tools: {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      webSearch_20250305: anthropicMocks.webSearch,
    },
  },
}));

import { getToolsWithWebSearch } from "../tool-utils";

describe("getToolsWithWebSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds Google web search tools when searchGrounding is enabled", () => {
    const provider: any = {
      provider: "Google",
      model: "gemini-2.5-pro",
      modelConfig: { searchGrounding: true },
      toolSet: { tools: { local: "local-tool" } },
    };

    const tools = getToolsWithWebSearch(provider);

    expect(googleMocks.googleSearch).toHaveBeenCalled();
    expect(googleMocks.urlContext).toHaveBeenCalled();
    expect(tools.google_search).toBe("google-search-tool");
    expect(tools.url_context).toBe("url-context-tool");
    expect(tools.local).toBe("local-tool");
  });

  it("adds Anthropic web search tool when searchGrounding is enabled", () => {
    const provider: any = {
      provider: "Anthropic",
      model: "claude-3-5-sonnet",
      modelConfig: { searchGrounding: true },
      toolSet: { tools: {} },
    };

    const tools = getToolsWithWebSearch(provider);

    expect(anthropicMocks.webSearch).toHaveBeenCalledWith({ maxUses: 5 });
    expect(tools.web_search).toBe("anthropic-web-search-tool");
  });

  it("returns existing tools when searchGrounding is disabled", () => {
    const provider: any = {
      provider: "Google",
      model: "gemini-2.5-pro",
      modelConfig: { searchGrounding: false },
      toolSet: { tools: { local: "local-tool" } },
    };

    const tools = getToolsWithWebSearch(provider);

    expect(googleMocks.googleSearch).not.toHaveBeenCalled();
    expect(tools).toEqual({ local: "local-tool" });
  });
});
