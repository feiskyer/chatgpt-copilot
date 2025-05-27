import assert from 'assert';
import { ModelConfig } from '../model-config';

describe('ModelConfig', () => {
    const defaultConfigParams = {
        provider: 'OpenAI',
        apiKey: 'test-key',
        apiBaseUrl: 'https://api.openai.com/v1',
        maxTokens: 1000,
        temperature: 0.7,
        topP: 1.0,
        organization: 'test-org',
        systemPrompt: 'You are a helpful assistant.',
    };

    it('should default sslVerify to true if not provided', () => {
        const modelConfig = new ModelConfig(defaultConfigParams);
        assert.strictEqual(modelConfig.sslVerify, true, 'sslVerify should default to true');
    });

    it('should set sslVerify to false when false is provided', () => {
        const modelConfig = new ModelConfig({
            ...defaultConfigParams,
            sslVerify: false,
        });
        assert.strictEqual(modelConfig.sslVerify, false, 'sslVerify should be false');
    });

    it('should set sslVerify to true when true is provided', () => {
        const modelConfig = new ModelConfig({
            ...defaultConfigParams,
            sslVerify: true,
        });
        assert.strictEqual(modelConfig.sslVerify, true, 'sslVerify should be true');
    });

    it('should correctly assign other properties', () => {
        const params = {
            ...defaultConfigParams,
            provider: 'Azure',
            apiKey: 'azure-key',
            sslVerify: false,
        };
        const modelConfig = new ModelConfig(params);
        assert.strictEqual(modelConfig.provider, 'Azure', 'Provider should be Azure');
        assert.strictEqual(modelConfig.apiKey, 'azure-key', 'API key should be azure-key');
        assert.strictEqual(modelConfig.sslVerify, false, 'sslVerify should be false for this specific test');
    });
});
