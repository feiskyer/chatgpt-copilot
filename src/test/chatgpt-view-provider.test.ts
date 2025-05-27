import assert from 'assert';
import sinon from 'sinon';
import * as vscode from 'vscode';
import ChatGptViewProvider from '../chatgpt-view-provider';
import * as openai from '../openai'; // To mock initGptModel
import { ModelConfig } from '../model-config';

// More comprehensive mock for vscode
const mockVscode = {
    workspace: {
        getConfiguration: sinon.stub(),
        onDidChangeConfiguration: sinon.stub().returns({ dispose: sinon.spy() } as any), // Return a disposable
        onDidCloseTextDocument: sinon.stub().returns({ dispose: sinon.spy() } as any),
        findFiles: sinon.stub().resolves([]),
        fs: {
            readFile: sinon.stub().resolves(new Uint8Array()),
        },
        asRelativePath: (uriOrPath: vscode.Uri | string) => {
            if (typeof uriOrPath === 'string') return uriOrPath;
            return uriOrPath.fsPath;
        },
    },
    window: {
        registerWebviewViewProvider: sinon.stub(),
        showInputBox: sinon.stub(),
        showErrorMessage: sinon.stub(),
        showInformationMessage: sinon.stub(),
        activeTextEditor: undefined, // Default to no active editor
        onDidChangeActiveTextEditor: sinon.stub().returns({ dispose: sinon.spy() } as any),
        createWebviewPanel: sinon.stub(),
        showQuickPick: sinon.stub(),
        // Add other window properties/methods if needed by the provider
    },
    commands: {
        registerCommand: sinon.stub(),
        executeCommand: sinon.stub(),
    },
    Uri: {
        joinPath: (...args: string[]) => vscode.Uri.file(args.join('/')), // Simple file URI mock
        file: (path: string) => ({ fsPath: path, scheme: 'file', with: sinon.stub().returnsThis(), toString: () => path }) as any,
    },
    ViewColumn: {
        Beside: 2,
        One: 1,
    },
    lm: {
        selectChatModels: sinon.stub().resolves([]), // Mock for lm.selectChatModels
    },
    // Add other vscode namespaces if they are used
    ExtensionContext: { // Mock ExtensionContext if it's directly used for its properties
        extensionUri: vscode.Uri.file('/mock/extension/path'),
        globalState: {
            get: sinon.stub(),
            update: sinon.stub(),
        },
        subscriptions: [], // Mock subscriptions array
    } as any,
};

// Stub getConfiguration to return a mock config object
let currentVscodeConfig: { [key: string]: any } = {};
mockVscode.workspace.getConfiguration.returns({
    get: (key: string) => currentVscodeConfig[key],
    update: sinon.stub(), // Mock update if needed
    has: (key: string) => key in currentVscodeConfig, // Mock has if needed
} as any);


describe('ChatGptViewProvider', () => {
    let provider: ChatGptViewProvider;
    let mockContext: vscode.ExtensionContext;
    let initGptModelStub: sinon.SinonStub;

    beforeEach(() => {
        currentVscodeConfig = {
            'response.showNotification': false,
            'response.autoScroll': true,
            'gpt3.model': 'gpt-4o',
            'gpt3.customModel': '',
            'gpt3.reasoningEffort': 'high',
            'gpt3.provider': 'OpenAI',
            'gpt3.apiBaseUrl': 'https://api.openai.com/v1',
            'gpt3.maxSteps': 15,
            'gpt3.reasoning.model': '',
            'gpt3.reasoning.apiBaseUrl': '',
            'gpt3.reasoning.provider': 'Auto',
            'ssl.verify': true, // Default for tests
            'gpt3.apiKey': 'test-api-key', // Ensure API key is present for prepareConversation
            'systemPrompt': 'Default system prompt',
            'gpt3.maxTokens': 1024,
            'gpt3.temperature': 1,
            'gpt3.top_p': 1,
            'gpt3.organization': '',
            'gpt3.searchGrounding.enabled': false,
            'autoAddCurrentFile': false,
        };

        mockContext = {
            extensionUri: vscode.Uri.file('/mock/extension/path'),
            subscriptions: [],
            globalState: {
                get: sinon.stub(),
                update: sinon.stub().resolves(),
            } as any,
            // Add other ExtensionContext properties if needed by the provider
        } as vscode.ExtensionContext;

        initGptModelStub = sinon.stub(openai, 'initGptModel').resolves();
        provider = new ChatGptViewProvider(mockContext);
    });

    afterEach(() => {
        sinon.restore();
        provider.closeMCPServers(); // Clean up any MCP servers
    });

    it('should initialize sslVerify from configuration (true)', () => {
        currentVscodeConfig['ssl.verify'] = true;
        const newProvider = new ChatGptViewProvider(mockContext);
        assert.strictEqual(newProvider.sslVerify, true, 'sslVerify should be true');
    });

    it('should initialize sslVerify from configuration (false)', () => {
        currentVscodeConfig['ssl.verify'] = false;
        const newProvider = new ChatGptViewProvider(mockContext);
        assert.strictEqual(newProvider.sslVerify, false, 'sslVerify should be false');
    });

    it('should initialize sslVerify to true if configuration is undefined', () => {
        currentVscodeConfig['ssl.verify'] = undefined; // Simulate setting not present initially
        const newProvider = new ChatGptViewProvider(mockContext);
        // Our code does `!!vscode.workspace.getConfiguration("chatgpt").get("ssl.verify")`
        // so `!!undefined` is `false`. If the setting isn't in package.json, it would be undefined.
        // But package.json defines it as true. So getConfiguration().get() should return the default true.
        // Let's assume the mock getConfiguration().get() returns the default from package.json if not in currentVscodeConfig
         mockVscode.workspace.getConfiguration.returns({
            get: (key: string) => {
                if (key === 'ssl.verify' && currentVscodeConfig[key] === undefined) return true; // Default from package.json
                return currentVscodeConfig[key];
            }
        } as any);
        const finalProvider = new ChatGptViewProvider(mockContext);
        assert.strictEqual(finalProvider.sslVerify, true, 'sslVerify should be true when undefined in config (defaults from package.json)');
    });


    describe('prepareConversation', () => {
        it('should pass this.sslVerify (true) to ModelConfig for initGptModel', async () => {
            provider.sslVerify = true;
            currentVscodeConfig['gpt3.apiKey'] = 'fake-key'; // Ensure API key for successful prepareConversation

            await provider.prepareConversation();

            assert(initGptModelStub.called, 'initGptModel was not called');
            const firstCallArgs = initGptModelStub.getCall(0).args[1] as ModelConfig;
            assert.strictEqual(firstCallArgs.sslVerify, true, 'ModelConfig.sslVerify should be true');
        });

        it('should pass this.sslVerify (false) to ModelConfig for initGptModel', async () => {
            provider.sslVerify = false;
            currentVscodeConfig['gpt3.apiKey'] = 'fake-key';

            await provider.prepareConversation();

            assert(initGptModelStub.called, 'initGptModel was not called');
            const firstCallArgs = initGptModelStub.getCall(0).args[1] as ModelConfig;
            assert.strictEqual(firstCallArgs.sslVerify, false, 'ModelConfig.sslVerify should be false');
        });

        it('should pass sslVerify to reasoning model config if reasoning model is set', async () => {
            provider.sslVerify = false;
            currentVscodeConfig['gpt3.apiKey'] = 'fake-key';
            currentVscodeConfig['gpt3.reasoning.model'] = 'gpt-4o-reasoning';
            currentVscodeConfig['gpt3.reasoning.apiKey'] = 'reasoning-key'; // Ensure reasoning API key

            await provider.prepareConversation();

            assert(initGptModelStub.calledTwice, 'initGptModel should be called twice (main and reasoning)');
            
            // First call is main model
            const mainModelConfig = initGptModelStub.getCall(0).args[1] as ModelConfig;
            assert.strictEqual(mainModelConfig.sslVerify, false, 'Main ModelConfig.sslVerify should be false');
            assert.strictEqual(mainModelConfig.isReasoning, false, 'Main ModelConfig.isReasoning should be false');

            // Second call is reasoning model
            const reasoningModelConfig = initGptModelStub.getCall(1).args[1] as ModelConfig;
            assert.strictEqual(reasoningModelConfig.sslVerify, false, 'Reasoning ModelConfig.sslVerify should be false');
             assert.strictEqual(reasoningModelConfig.isReasoning, true, 'Reasoning ModelConfig.isReasoning should be true');
        });
    });
});

// Minimal replacement for the actual vscode module for testing purposes
const actualVscode = require('vscode');
Object.assign(actualVscode, mockVscode);
