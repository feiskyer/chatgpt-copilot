import assert from 'assert';
import sinon from 'sinon';
import https from 'https';
import * as isoFetch from 'isomorphic-fetch'; // Import like this to spy on default export
import { fetchOpenAI } from '../utils';

describe('fetchOpenAI', () => {
    let fetchStub: sinon.SinonStub;
    let agentStub: sinon.SinonStub;
    let originalWindow: any;

    beforeEach(() => {
        // Stub the global fetch used by isomorphic-fetch
        fetchStub = sinon.stub(isoFetch, 'default'); // Use .default for ES module default export
        agentStub = sinon.stub(https, 'Agent');

        // Store original window and delete it to simulate Node.js environment for most tests
        originalWindow = (global as any).window;
        delete (global as any).window;
    });

    afterEach(() => {
        sinon.restore();
        // Restore window for other tests if it was originally present
        if (originalWindow !== undefined) {
            (global as any).window = originalWindow;
        } else {
            delete (global as any).window; // Ensure it's cleared if it wasn't there
        }
    });

    describe('Node.js environment (window is undefined)', () => {
        it('should use https.Agent with rejectUnauthorized: false when sslVerify is false', async () => {
            const mockAgentInstance = { an: 'agent' };
            agentStub.returns(mockAgentInstance);
            fetchStub.resolves(new Response('{}', { status: 200 }));

            await fetchOpenAI('https://example.com', {}, false);

            assert(agentStub.calledOnceWithExactly({ rejectUnauthorized: false }), 'https.Agent should be called with rejectUnauthorized: false');
            assert(fetchStub.calledOnce, 'fetch should be called');
            const fetchOptions = fetchStub.firstCall.args[1] as any;
            assert.deepStrictEqual(fetchOptions.agent, mockAgentInstance, 'fetch should be called with the mocked agent');
        });

        it('should not use custom https.Agent when sslVerify is true', async () => {
            fetchStub.resolves(new Response('{}', { status: 200 }));
            await fetchOpenAI('https://example.com', {}, true);

            assert(agentStub.notCalled, 'https.Agent should not be called');
            assert(fetchStub.calledOnce, 'fetch should be called');
            const fetchOptions = fetchStub.firstCall.args[1] as any;
            assert.strictEqual(fetchOptions.agent, undefined, 'fetch should be called without a custom agent');
        });

        it('should default to sslVerify true and not use custom https.Agent', async () => {
            fetchStub.resolves(new Response('{}', { status: 200 }));
            await fetchOpenAI('https://example.com', {}); // sslVerify is not provided

            assert(agentStub.notCalled, 'https.Agent should not be called');
            assert(fetchStub.calledOnce, 'fetch should be called');
            const fetchOptions = fetchStub.firstCall.args[1] as any;
            assert.strictEqual(fetchOptions.agent, undefined, 'fetch should be called without a custom agent by default');
        });
    });

    describe('Browser-like environment (window is defined)', () => {
        beforeEach(() => {
            // Simulate browser environment
            (global as any).window = {};
        });

        afterEach(() => {
            // Clean up browser environment simulation
            delete (global as any).window;
             if (originalWindow !== undefined) { // Restore original window if it existed
                (global as any).window = originalWindow;
            }
        });

        it('should not use https.Agent even if sslVerify is false', async () => {
            fetchStub.resolves(new Response('{}', { status: 200 }));
            await fetchOpenAI('https://example.com', {}, false);

            assert(agentStub.notCalled, 'https.Agent should not be called in browser environment');
            assert(fetchStub.calledOnce, 'fetch should be called');
            const fetchOptions = fetchStub.firstCall.args[1] as any;
            assert.strictEqual(fetchOptions.agent, undefined, 'fetch should be called without a custom agent in browser');
        });
    });

    describe('Body modification logic', () => {
        const testUrl = 'https://test.com/api';
        const baseOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        };

        it('should correctly modify tools in the body when body is present', async () => {
            fetchStub.resolves(new Response('{}', { status: 200 }));
            const bodyWithStrictTool = {
                tools: [
                    { type: 'function', function: { name: 'get_weather', strict: true, parameters: {} } },
                    { type: 'other', other_data: {} }
                ]
            };
            const options = { ...baseOptions, body: JSON.stringify(bodyWithStrictTool) };

            await fetchOpenAI(testUrl, options, true);

            assert(fetchStub.calledOnce, 'fetch was not called');
            const actualOptions = fetchStub.firstCall.args[1];
            assert(actualOptions, 'fetch options are undefined');
            assert(actualOptions.body, 'fetch options body is undefined');

            const sentBody = JSON.parse(actualOptions.body as string);
            assert.deepStrictEqual(sentBody.tools[0].function, { name: 'get_weather', parameters: {} }, 'Strict flag was not removed');
            assert.deepStrictEqual(sentBody.tools[1], { type: 'other', other_data: {} }, 'Other tool data was modified');
        });

        it('should not attempt to parse or modify body if options.body is not present', async () => {
            fetchStub.resolves(new Response('{}', { status: 200 }));
            const options = { ...baseOptions }; // No body

            await fetchOpenAI(testUrl, options, true);

            assert(fetchStub.calledOnce, 'fetch was not called');
            const actualOptions = fetchStub.firstCall.args[1];
            assert(actualOptions, 'fetch options are undefined');
            assert.strictEqual(actualOptions.body, undefined, 'Body should be undefined');
        });

        it('should handle empty body string correctly', async () => {
            fetchStub.resolves(new Response('{}', { status: 200 }));
            const options = { ...baseOptions, body: '' };

            await fetchOpenAI(testUrl, options, true);
            assert(fetchStub.calledOnce);
            const actualOptions = fetchStub.firstCall.args[1];
            // Depending on fetch implementation, empty string body might be passed as is or omitted.
            // For this test, we check it's not JSON.parse'd into an error and that our tool logic isn't hit.
            // The key is that JSON.parse(options.body as string) would throw if called with empty string.
            // Our current code has `if (!effectiveOptions?.body)` check which handles this.
            assert.strictEqual(actualOptions.body, '', 'Body should be an empty string or undefined');
        });


        it('should handle body with no tools array correctly', async () => {
            fetchStub.resolves(new Response('{}', { status: 200 }));
            const bodyWithoutTools = { message: "hello" };
            const options = { ...baseOptions, body: JSON.stringify(bodyWithoutTools) };

            await fetchOpenAI(testUrl, options, true);

            assert(fetchStub.calledOnce);
            const actualOptions = fetchStub.firstCall.args[1];
            const sentBody = JSON.parse(actualOptions.body as string);
            assert.deepStrictEqual(sentBody, bodyWithoutTools, 'Body was unexpectedly modified');
        });
    });
});
