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
import { ChatMessageHistory } from "langchain/stores/message/in_memory";

export class ModelConfig {
    apiKey: string;
    apiBaseUrl: string;
    maxTokens: number;
    temperature: number;
    topP: number;
    organization: string;
    googleCSEApiKey: string;
    googleCSEId: string;
    serperKey: string;
    bingKey: string;
    messageHistory: ChatMessageHistory;

    constructor({ apiKey, apiBaseUrl, maxTokens, temperature, topP, organization, googleCSEApiKey, googleCSEId, serperKey, bingKey, messageHistory }: { apiKey: string; apiBaseUrl: string; maxTokens: number; temperature: number; topP: number; organization: string; googleCSEApiKey: string; googleCSEId: string; serperKey: string; bingKey: string; messageHistory: ChatMessageHistory; }) {
        this.apiKey = apiKey;
        this.apiBaseUrl = apiBaseUrl;
        this.maxTokens = maxTokens;
        this.temperature = temperature;
        this.topP = topP;
        this.organization = organization;
        this.googleCSEApiKey = googleCSEApiKey;
        this.googleCSEId = googleCSEId;
        this.serperKey = serperKey;
        this.bingKey = bingKey;
        this.messageHistory = messageHistory;
    }
}