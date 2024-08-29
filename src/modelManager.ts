// src/modelManager.ts

import { ChatGptViewProvider } from './chatgptViewProvider';
import { defaultSystemPrompt, getApiKey } from "./config/configuration";
import { initClaudeModel } from './llm_models/anthropic';
import { initGeminiModel } from './llm_models/gemini';
import { initGptModel } from './llm_models/openai';
import { initGptLegacyModel } from './llm_models/openai-legacy';
import { LogLevel, Logger } from "./logger";
import { ModelConfig } from "./model-config";

export class ModelManager {
    public model?: string;
    public modelConfig!: ModelConfig;

    constructor() { }

    public async prepareModelForConversation(
        modelChanged = false,
        logger: Logger,
        viewProvider: ChatGptViewProvider,
    ): Promise<boolean> {
        logger.log(LogLevel.Info, "loading configuration from vscode workspace");

        const configuration = viewProvider.getWorkspaceConfiguration();

        if (this.model === "custom") {
            logger.log(LogLevel.Info, "custom model, retrieving model name");
            this.model = configuration.get("gpt3.customModel") as string;
        }

        if (
            (this.isGpt35Model && !viewProvider.apiChat) ||
            (this.isClaude && !viewProvider.apiChat) ||
            (this.isGemini && !viewProvider.apiChat) ||
            (!this.isGpt35Model && !this.isClaude && !this.isGemini && !viewProvider.apiCompletion) ||
            modelChanged
        ) {
            logger.log(LogLevel.Info, "getting API key");
            let apiKey = await getApiKey();
            if (!apiKey) {
                logger.log(LogLevel.Info, "API key not found, prepare model for conversation returning false");
                return false; // Exit if API key is not obtained
            }

            logger.log(LogLevel.Info, "retrieving model configuration values organization, maxTokens, temperature, and topP");
            const organization = configuration.get("gpt3.organization") as string;
            const maxTokens = configuration.get("gpt3.maxTokens") as number;
            const temperature = configuration.get("gpt3.temperature") as number;
            const topP = configuration.get("gpt3.top_p") as number;

            let systemPrompt = configuration.get("systemPrompt") as string;
            logger.log(LogLevel.Info, "retrieving system prompt");
            if (!systemPrompt) {
                logger.log(LogLevel.Info, "no systemPrompt found, using default system prompt");
                systemPrompt = defaultSystemPrompt;
            }

            logger.log(LogLevel.Info, "retrieving api base url value");
            let apiBaseUrl = configuration.get("gpt3.apiBaseUrl") as string;
            if (!apiBaseUrl && this.isGpt35Model) {
                logger.log(LogLevel.Info, "no api base url value found, using default api base url");
                apiBaseUrl = "https://api.openai.com/v1";
            }
            if (!apiBaseUrl || apiBaseUrl === "https://api.openai.com/v1") {
                if (this.isClaude) {
                    logger.log(LogLevel.Info, "model is claude and api base url is default, replacing it with claude base url");
                    apiBaseUrl = "https://api.anthropic.com/v1";
                } else if (this.isGemini) {
                    logger.log(LogLevel.Info, "model is gemini and api base url is default, replacing it with gemini base url");
                    apiBaseUrl = "https://generativelanguage.googleapis.com/v1beta";
                }
            }

            logger.log(LogLevel.Info, "instantiating model config");
            this.modelConfig = new ModelConfig({
                apiKey, apiBaseUrl, maxTokens, temperature, topP, organization, systemPrompt
            });

            logger.log(LogLevel.Info, "initializing model");
            await this.initModels(viewProvider);
        }

        return true;
    }

    private async initModels(viewProvider: ChatGptViewProvider): Promise<void> {
        if (this.isGpt35Model) {
            await initGptModel(viewProvider, this.modelConfig);
        } else if (this.isClaude) {
            await initClaudeModel(viewProvider, this.modelConfig);
        } else if (this.isGemini) {
            await initGeminiModel(viewProvider, this.modelConfig);
        } else {
            initGptLegacyModel(viewProvider, this.modelConfig);
        }
    }

    public get isCodexModel(): boolean {
        if (this.model == null) {
            return false;
        }
        return this.model.includes("instruct") || this.model.includes("code-");
    }

    public get isGpt35Model(): boolean {
        return !this.isCodexModel && !this.isClaude && !this.isGemini;
    }

    public get isClaude(): boolean {
        return !!this.model?.startsWith("claude-");
    }

    public get isGemini(): boolean {
        return !!this.model?.startsWith("gemini-");
    }
}
