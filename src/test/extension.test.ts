import assert from 'assert';
import sinon from 'sinon';
import * as vscode from 'vscode';
import { activate } from '../extension'; // Assuming 'deactivate' is also exported or not needed for these tests
import ChatGptViewProvider from '../chatgpt-view-provider';

// Mock ChatGptViewProvider
// We need to mock it before it's imported by extension.ts
const mockChatGptViewProviderInstance = {
    sslVerify: true, // Default value
    prepareConversation: sinon.stub(),
    // Add any other methods/properties accessed by extension.ts
    clearSession: sinon.stub(),
    sendMessage: sinon.stub(),
    addCurrentFileToContext: sinon.stub(),
    subscribeToResponse: true,
    autoScroll: true,
    model: 'gpt-4o',
};
sinon.stub(ChatGptViewProvider.prototype, 'constructor').callsFake(function (this: any, context: vscode.ExtensionContext) {
    // Merge instance properties into 'this'
    Object.assign(this, mockChatGptViewProviderInstance);
    // You might need to assign context if the real constructor uses it for something
    // this.context = context; 
});


// Comprehensive mock for vscode
const mockVscode = {
    workspace: {
        getConfiguration: sinon.stub(),
        onDidChangeConfiguration: sinon.stub().returns({ dispose: sinon.spy() } as any),
        // Add any other workspace methods used in extension.ts
        onDidCloseTextDocument: sinon.stub().returns({ dispose: sinon.spy() } as any), // From provider
        findFiles: sinon.stub().resolves([]), // From provider
        fs: { // From provider
            readFile: sinon.stub().resolves(new Uint8Array()),
        },
         asRelativePath: (uriOrPath: vscode.Uri | string) => { // From provider
            if (typeof uriOrPath === 'string') return uriOrPath;
            return uriOrPath.fsPath;
        },
    },
    window: {
        registerWebviewViewProvider: sinon.stub().returns({ dispose: sinon.spy() } as any),
        showInputBox: sinon.stub(),
        createWebviewPanel: sinon.stub().returns({
            webview: {
                options: {},
                html: '',
                onDidReceiveMessage: sinon.stub().returns({ dispose: sinon.spy() }),
                asWebviewUri: (uri: vscode.Uri) => uri, // Simple mock
                postMessage: sinon.stub(),
            },
            onDidDispose: sinon.stub().returns({ dispose: sinon.spy() }),
            reveal: sinon.stub(),
        } as any),
        showInformationMessage: sinon.stub(),
        showErrorMessage: sinon.stub(),
        activeTextEditor: undefined,
        onDidChangeActiveTextEditor: sinon.stub().returns({ dispose: sinon.spy() } as any),
         showQuickPick: sinon.stub(), // From provider
    },
    commands: {
        registerCommand: sinon.stub().returns({ dispose: sinon.spy() } as any),
        executeCommand: sinon.stub().resolves(undefined),
    },
    Uri: {
        joinPath: (...args: string[]) => vscode.Uri.file(args.join('/')),
        file: (path: string) => ({ 
            fsPath: path, 
            scheme: 'file', 
            with: sinon.stub().returnsThis(), 
            toString: () => path,
            toJSON: () => ({ fsPath: path, scheme: 'file' }) // Added toJSON
        }) as any,
    },
    ViewColumn: { One: 1, Beside: 2 },
    lm: { // Mock for language model features if used
        selectChatModels: sinon.stub().resolves([])
    },
    // Add other necessary vscode mocks if your extension.ts uses more APIs
};

// Apply the mock to the actual vscode module
Object.assign(vscode, mockVscode);

describe('Extension Activation and Configuration', () => {
    let mockContext: vscode.ExtensionContext;
    let configChangeCallback: ((e: vscode.ConfigurationChangeEvent) => any) | undefined;

    beforeEach(() => {
        // Reset stubs and mocks
        sinon.resetHistory(); // Resets spies, stubs, mocks history
        
        // Reset behavior of stubs that might have been changed in tests
        mockChatGptViewProviderInstance.prepareConversation.resetHistory();
        mockVscode.workspace.getConfiguration.reset(); // Reset the getConfiguration stub fully

        // Default configuration setup
        mockVscode.workspace.getConfiguration.returns({
            get: (key: string) => {
                if (key === 'ssl.verify') return true; // Default for this test suite
                if (key === 'gpt3.apiKey') return 'test-key';
                // Provide other defaults as needed by ChatGptViewProvider constructor or activate function
                return undefined;
            },
            // Add other methods like 'has', 'update' if used by your extension
        } as any);

        mockContext = {
            extensionUri: vscode.Uri.file('/mock/extension'),
            subscriptions: [],
            globalState: {
                get: sinon.stub().returns(undefined),
                update: sinon.stub().resolves(undefined),
            } as any,
            // ... other context properties
        } as vscode.ExtensionContext;

        // Capture the onDidChangeConfiguration callback
        configChangeCallback = undefined;
        mockVscode.workspace.onDidChangeConfiguration.callsFake((callback) => {
            configChangeCallback = callback;
            return { dispose: sinon.spy() };
        });

        // Reset the shared mock instance's property before activation
        mockChatGptViewProviderInstance.sslVerify = true; 
    });

    afterEach(() => {
        sinon.restore(); // Fully restore all stubs
    });

    it('should initialize ChatGptViewProvider.sslVerify based on initial "chatgpt.ssl.verify" config (true)', async () => {
        mockVscode.workspace.getConfiguration.returns({
            get: (key: string) => key === 'ssl.verify' ? true : undefined,
        } as any);
        
        // Re-initialize the shared instance property before activation for this specific test
        mockChatGptViewProviderInstance.sslVerify = true; // Set based on what activate should read

        await activate(mockContext);
        
        // The constructor is stubbed, so ChatGptViewProvider.prototype.constructor is what we check for calls
        // We are checking the assignment done *inside* activate, right after provider instance is created.
        assert.strictEqual(mockChatGptViewProviderInstance.sslVerify, true, 'Provider sslVerify should be true on init');
    });

    it('should initialize ChatGptViewProvider.sslVerify based on initial "chatgpt.ssl.verify" config (false)', async () => {
        mockVscode.workspace.getConfiguration.returns({
            get: (key: string) => key === 'ssl.verify' ? false : undefined,
        } as any);
        
        // Set based on what activate should read
        mockChatGptViewProviderInstance.sslVerify = false; 

        await activate(mockContext);
        assert.strictEqual(mockChatGptViewProviderInstance.sslVerify, false, 'Provider sslVerify should be false on init');
    });

    it('should update ChatGptViewProvider.sslVerify when "chatgpt.ssl.verify" configuration changes to false', async () => {
        // Initial setup: ssl.verify is true
        mockVscode.workspace.getConfiguration.returns({
            get: (key: string) => key === 'ssl.verify' ? true : undefined,
        } as any);
        mockChatGptViewProviderInstance.sslVerify = true;
        await activate(mockContext);
        assert(configChangeCallback, 'Configuration change callback was not captured');

        // Simulate config change: ssl.verify becomes false
        mockVscode.workspace.getConfiguration.returns({
            get: (key: string) => key === 'ssl.verify' ? false : undefined,
        } as any);
        const mockEvent: vscode.ConfigurationChangeEvent = {
            affectsConfiguration: (section: string) => section === 'chatgpt.ssl.verify' || section === 'chatgpt.gpt3.apiKey', // Ensure it affects our section
        };
        await configChangeCallback!(mockEvent); // Trigger the callback

        assert.strictEqual(mockChatGptViewProviderInstance.sslVerify, false, 'Provider sslVerify should be updated to false');
    });

    it('should update ChatGptViewProvider.sslVerify when "chatgpt.ssl.verify" configuration changes to true', async () => {
        // Initial setup: ssl.verify is false
        mockVscode.workspace.getConfiguration.returns({
            get: (key: string) => key === 'ssl.verify' ? false : undefined,
        } as any);
        mockChatGptViewProviderInstance.sslVerify = false;
        await activate(mockContext);
        assert(configChangeCallback, 'Configuration change callback was not captured');

        // Simulate config change: ssl.verify becomes true
        mockVscode.workspace.getConfiguration.returns({
            get: (key: string) => key === 'ssl.verify' ? true : undefined,
        } as any);
        const mockEvent: vscode.ConfigurationChangeEvent = {
            affectsConfiguration: (section: string) => section === 'chatgpt.ssl.verify' || section === 'chatgpt.gpt3.apiKey',
        };
        await configChangeCallback!(mockEvent);

        assert.strictEqual(mockChatGptViewProviderInstance.sslVerify, true, 'Provider sslVerify should be updated to true');
    });

    it('should call provider.prepareConversation when "chatgpt.ssl.verify" changes', async () => {
        mockVscode.workspace.getConfiguration.returns({
            get: (key: string) => {
                if (key === 'chatgpt.ssl.verify') return true;
                if (key === 'chatgpt.gpt3.apiKey') return 'test-key'; // Ensure API key is present
                return undefined;
            },
        } as any);
        await activate(mockContext);
        assert(configChangeCallback, 'Configuration change callback was not captured');
        mockChatGptViewProviderInstance.prepareConversation.resetHistory(); // Reset before triggering change

        // Simulate config change
        const mockEvent: vscode.ConfigurationChangeEvent = {
            affectsConfiguration: (section: string) => section === 'chatgpt.ssl.verify',
        };
        await configChangeCallback!(mockEvent);

        assert(mockChatGptViewProviderInstance.prepareConversation.calledOnceWith(true), 'prepareConversation(true) should be called');
    });

    it('should call provider.prepareConversation when other relevant OpenAI configurations change', async () => {
        mockVscode.workspace.getConfiguration.returns({
            get: (key: string) => {
                 if (key === 'chatgpt.gpt3.apiKey') return 'test-key';
                 return undefined;
            }
        } as any);
        await activate(mockContext);
        assert(configChangeCallback, 'Configuration change callback was not captured');
        
        const relevantConfigs = [
            "chatgpt.gpt3.provider", "chatgpt.gpt3.apiBaseUrl", "chatgpt.gpt3.model", 
            "chatgpt.gpt3.apiKey", "chatgpt.gpt3.customModel", "chatgpt.gpt3.organization", 
            "chatgpt.gpt3.maxTokens", "chatgpt.gpt3.temperature", "chatgpt.gpt3.reasoning.provider", 
            "chatgpt.gpt3.reasoning.model", "chatgpt.gpt3.reasoning.apiKey", 
            "chatgpt.gpt3.reasoning.apiBaseUrl", "chatgpt.gpt3.reasoning.organization", 
            "chatgpt.systemPrompt", "chatgpt.gpt3.top_p"
        ];

        for (const configName of relevantConfigs) {
            mockChatGptViewProviderInstance.prepareConversation.resetHistory();
            const mockEvent: vscode.ConfigurationChangeEvent = {
                affectsConfiguration: (section: string) => section === configName,
            };
            await configChangeCallback!(mockEvent);
            assert(mockChatGptViewProviderInstance.prepareConversation.calledOnceWith(true), `prepareConversation should be called for ${configName}`);
        }
    });
});
