import assert from 'assert';
import sinon from 'sinon';
import * as aiSdkOpenai from '@ai-sdk/openai';
import * as aiSdkAzure from '@ai-sdk/azure';
import * as utils from '../utils'; // To mock fetchOpenAI
import { initGptModel } from '../openai';
import { ModelConfig } from '../model-config';
import ChatGptViewProvider from '../chatgpt-view-provider'; // Minimal mock needed

describe('initGptModel', () => {
    let createOpenAISpy: sinon.SinonSpy;
    let createAzureSpy: sinon.SinonSpy;
    let fetchOpenAIStub: sinon.SinonStub;
    let mockViewProvider: Partial<ChatGptViewProvider>;

    beforeEach(() => {
        createOpenAISpy = sinon.spy(aiSdkOpenai, 'createOpenAI');
        createAzureSpy = sinon.spy(aiSdkAzure, 'createAzure');
        fetchOpenAIStub = sinon.stub(utils, 'fetchOpenAI').resolves(new Response('{}'));

        // A minimal mock for ChatGptViewProvider, only including properties accessed by initGptModel
        mockViewProvider = {
            // model: 'gpt-4o', // example default
            // reasoningModel: 'o3-mini', // example default
            // apiChat: undefined,
            // apiReasoning: undefined,
        };
    });

    afterEach(() => {
        sinon.restore();
    });

    const commonConfigParams = {
        provider: 'OpenAI', // This will be overridden in Azure tests
        apiKey: 'test-key',
        maxTokens: 1000,
        temperature: 0.7,
        topP: 1.0,
        organization: 'test-org',
        systemPrompt: 'You are helpful.',
        searchGrounding: false,
        isReasoning: false,
    };

    it('should call createOpenAI and pass sslVerify=true to fetchOpenAI wrapper', async () => {
        const modelConfig = new ModelConfig({
            ...commonConfigParams,
            apiBaseUrl: 'https://api.openai.com/v1',
            sslVerify: true,
        });

        await initGptModel(mockViewProvider as ChatGptViewProvider, modelConfig);

        assert(createOpenAISpy.calledOnce, 'createOpenAI was not called');
        const createOpenAIOptions = createOpenAISpy.firstCall.args[0];
        assert.strictEqual(createOpenAIOptions.apiKey, 'test-key');
        assert.strictEqual(createOpenAIOptions.baseURL, 'https://api.openai.com/v1');
        
        // Call the passed fetch function to check what it does
        await createOpenAIOptions.fetch('https://someurl.com', {});
        assert(fetchOpenAIStub.calledOnceWith(sinon.match.any, sinon.match.any, true), 'fetchOpenAI not called with sslVerify=true');
    });

    it('should call createOpenAI and pass sslVerify=false to fetchOpenAI wrapper', async () => {
        const modelConfig = new ModelConfig({
            ...commonConfigParams,
            apiBaseUrl: 'https://api.openai.com/v1',
            sslVerify: false,
        });

        await initGptModel(mockViewProvider as ChatGptViewProvider, modelConfig);

        assert(createOpenAISpy.calledOnce, 'createOpenAI was not called');
        const createOpenAIOptions = createOpenAISpy.firstCall.args[0];
        
        await createOpenAIOptions.fetch('https://someurl.com', {});
        assert(fetchOpenAIStub.calledOnceWith(sinon.match.any, sinon.match.any, false), 'fetchOpenAI not called with sslVerify=false');
    });

    it('should call createAzure and pass sslVerify=true to fetchOpenAI wrapper', async () => {
        const modelConfig = new ModelConfig({
            ...commonConfigParams,
            provider: 'Azure',
            apiBaseUrl: 'https://my-azure.openai.azure.com/openai/deployments/my-deploy',
            sslVerify: true,
        });
        (mockViewProvider as any).model = "my-deploy";


        await initGptModel(mockViewProvider as ChatGptViewProvider, modelConfig);

        assert(createAzureSpy.calledOnce, 'createAzure was not called');
        const createAzureOptions = createAzureSpy.firstCall.args[0];
        assert.strictEqual(createAzureOptions.apiKey, 'test-key');
        assert.strictEqual(createAzureOptions.resourceName, 'my-azure');
        
        await createAzureOptions.fetch('https://someurl.com', {});
        assert(fetchOpenAIStub.calledOnceWith(sinon.match.any, sinon.match.any, true), 'fetchOpenAI not called with sslVerify=true for Azure');
    });

    it('should call createAzure and pass sslVerify=false to fetchOpenAI wrapper', async () => {
        const modelConfig = new ModelConfig({
            ...commonConfigParams,
            provider: 'Azure',
            apiBaseUrl: 'https://my-azure.openai.azure.com/openai/deployments/my-deploy',
            sslVerify: false,
        });
        (mockViewProvider as any).model = "my-deploy";

        await initGptModel(mockViewProvider as ChatGptViewProvider, modelConfig);

        assert(createAzureSpy.calledOnce, 'createAzure was not called');
        const createAzureOptions = createAzureSpy.firstCall.args[0];

        await createAzureOptions.fetch('https://someurl.com', {});
        assert(fetchOpenAIStub.calledOnceWith(sinon.match.any, sinon.match.any, false), 'fetchOpenAI not called with sslVerify=false for Azure');
    });

    it('should handle reasoning model config for OpenAI', async () => {
        const reasoningConfig = new ModelConfig({
            ...commonConfigParams,
            apiBaseUrl: 'https://api.openai.com/v1',
            sslVerify: true,
            isReasoning: true,
        });
        mockViewProvider.reasoningModel = 'gpt-4o-reasoning';

        await initGptModel(mockViewProvider as ChatGptViewProvider, reasoningConfig);
        assert(createOpenAISpy.calledOnce);
        const createOpenAIOptions = createOpenAISpy.firstCall.args[0];
        await createOpenAIOptions.fetch('https://someurl.com', {});
        assert(fetchOpenAIStub.calledOnceWith(sinon.match.any, sinon.match.any, true));
        assert(mockViewProvider.apiReasoning, 'apiReasoning should be set for reasoning model');
    });

    it('should handle reasoning model config for Azure', async () => {
        const reasoningConfig = new ModelConfig({
            ...commonConfigParams,
            provider: 'Azure',
            apiBaseUrl: 'https://my-azure.openai.azure.com/openai/deployments/my-reasoning-deploy',
            sslVerify: true,
            isReasoning: true,
        });
         (mockViewProvider as any).reasoningModel = "my-reasoning-deploy";


        await initGptModel(mockViewProvider as ChatGptViewProvider, reasoningConfig);
        assert(createAzureSpy.calledOnce);
        const createAzureOptions = createAzureSpy.firstCall.args[0];
        await createAzureOptions.fetch('https://someurl.com', {});
        assert(fetchOpenAIStub.calledOnceWith(sinon.match.any, sinon.match.any, true));
        assert(mockViewProvider.apiReasoning, 'apiReasoning should be set for Azure reasoning model');
    });
});
