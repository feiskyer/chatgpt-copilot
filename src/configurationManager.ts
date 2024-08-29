import { getConfig, getRequiredConfig } from "./config/configuration";
import { Logger, LogLevel } from "./logger";
import { ModelManager } from "./modelManager";

interface IConfigurationManager {
    loadConfiguration(): void;
    getWorkspaceConfiguration(): any; // Define a more specific type if possible
}

export class ConfigurationManager implements IConfigurationManager {
    private logger: Logger;
    public modelManager: ModelManager;

    public subscribeToResponse: boolean = false;
    public autoScroll: boolean = false;
    public conversationHistoryEnabled: boolean = true;
    public apiBaseUrl?: string;

    constructor(logger: Logger, modelManager: ModelManager) {
        this.logger = logger;
        this.modelManager = modelManager;
        this.loadConfiguration();
    }

    public loadConfiguration() {
        this.modelManager.model = getRequiredConfig<string>("gpt3.model");
        this.subscribeToResponse = getConfig<boolean>("response.showNotification", false);
        this.autoScroll = !!getConfig<boolean>("response.autoScroll", false);
        this.conversationHistoryEnabled = getConfig<boolean>("conversationHistoryEnabled", true);

        if (this.modelManager.model === "custom") {
            this.modelManager.model = getRequiredConfig<string>("gpt3.customModel");
        }
        this.apiBaseUrl = getRequiredConfig<string>("gpt3.apiBaseUrl");

        // Azure model names can't contain dots.
        if (this.apiBaseUrl?.includes("azure")) {
            this.modelManager.model = this.modelManager.model?.replace(".", "");
        }

        this.logger.log(LogLevel.Info, "Configuration loaded");
    }

    public getWorkspaceConfiguration() {
        return vscode.workspace.getConfiguration("chatgpt");
    }
}
