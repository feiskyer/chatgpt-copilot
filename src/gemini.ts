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
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import ChatGptViewProvider from "./chatgpt-view-provider";
import { ModelConfig } from "./model-config";

// initGeminiModel initializes the Gemini model with the given parameters.
export async function initGeminiModel(viewProvider: ChatGptViewProvider, config: ModelConfig) {
    let gemini = createGoogleGenerativeAI({
        baseURL: config.apiBaseUrl,
        apiKey: config.apiKey,
    });
    const model = viewProvider.model ? viewProvider.model : "gemini-1.5-flash-latest";
    viewProvider.apiChat = gemini(model);

    if (config.searchGrounding) {
        viewProvider.apiChat = gemini(model, {
            useSearchGrounding: config.searchGrounding,
        });
    }
}
