// llm_models/anthropic.ts

/* eslint-disable eqeqeq */
/* eslint-disable @typescript-eslint/naming-convention */
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
import { createAnthropic } from '@ai-sdk/anthropic';
import ChatGptViewProvider from "../chatgpt-view-provider";
import { ModelConfig } from "../model-config";

// initClaudeModel initializes the Claude model with the given parameters.
export async function initClaudeModel(viewProvider: ChatGptViewProvider, config: ModelConfig) {
    const claude = createAnthropic({
        baseURL: config.apiBaseUrl,
        apiKey: config.apiKey,
    });
    viewProvider.apiChat = claude.chat(viewProvider.modelManager.model ? viewProvider.modelManager.model : "claude-3-5-sonnet-20240620");
}
