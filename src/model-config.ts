// model-config.ts

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

export class ModelConfig {
    apiKey: string;
    apiBaseUrl: string;
    maxTokens: number;
    temperature: number;
    topP: number;
    organization: string;
    systemPrompt: string;

    constructor({ apiKey, apiBaseUrl, maxTokens, temperature, topP, organization, systemPrompt }: { apiKey: string; apiBaseUrl: string; maxTokens: number; temperature: number; topP: number; organization: string; systemPrompt: string; }) {
        this.apiKey = apiKey;
        this.apiBaseUrl = apiBaseUrl;
        this.maxTokens = maxTokens;
        this.temperature = temperature;
        this.topP = topP;
        this.organization = organization;
        this.systemPrompt = systemPrompt;
    }
}