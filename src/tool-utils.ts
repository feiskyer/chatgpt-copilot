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

import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import ChatGptViewProvider from "./chatgpt-view-provider";
import { logger } from "./logger";

/**
 * Gets tools for the provider, including web search tools when searchGrounding is enabled
 * @param provider The ChatGptViewProvider instance
 * @returns The tools object with web search tools added if applicable
 */
export function getToolsWithWebSearch(provider: ChatGptViewProvider): any {
  let tools = provider.toolSet?.tools;

  // Add web search tools for Google Gemini and Anthropic Claude when searchGrounding is enabled
  if (provider.modelConfig.searchGrounding) {
    // For Google Gemini models
    if (provider.provider === "Google" && provider.model?.includes("gemini")) {
      tools = {
        ...tools,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        google_search: google.tools.googleSearch({}),
        // eslint-disable-next-line @typescript-eslint/naming-convention
        url_context: google.tools.urlContext({}),
      };
      logger.appendLine(
        `INFO: Added Google web search tools for model: ${provider.model}`,
      );
    }
    // For Anthropic Claude models
    else if (
      provider.provider === "Anthropic" &&
      provider.model?.includes("claude")
    ) {
      tools = {
        ...tools,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        web_search: anthropic.tools.webSearch_20250305({
          maxUses: 5,
        }),
      };
      logger.appendLine(
        `INFO: Added Anthropic web search tool for model: ${provider.model}`,
      );
    }
  }

  return tools;
}
