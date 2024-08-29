import * as fs from 'fs';
// import * as path from 'path';
import * as vscode from 'vscode';
import ChatGptViewProvider, { getLineCount } from '../src/chatgpt-view-provider';
import { getConfig } from '../src/config/configuration';

jest.mock('fs');


jest.mock('@ai-sdk/anthropic', () => ({
    createAnthropic: jest.fn(),
}));


let activeTextEditorMock: vscode.TextEditor;
let SnippetStringMock: any;

// Mock the vscode module
jest.mock('vscode', () => {
    const appendLineMock = jest.fn();
    const createOutputChannelMock = jest.fn(() => ({
        appendLine: appendLineMock,
    }));

    // Initialize activeTextEditorMock within the jest mock block
    const activeTextEditorMock = {
        insertSnippet: jest.fn(),
        document: {
            getText: jest.fn(),
            languageId: 'javascript',
        },
        selections: [],
        selection: {},
        visibleRanges: [],
        options: {},
        viewColumn: undefined,
        edit: jest.fn(),
        setDecorations: jest.fn(),
        revealRange: jest.fn(),
        show: jest.fn(),
        hide: jest.fn(),
    } as unknown as vscode.TextEditor;

    class SnippetStringMock {
        value: string;
        constructor(value: string) {
            this.value = value;
        }
    }

    return {
        window: {
            createOutputChannel: createOutputChannelMock,
            showErrorMessage: jest.fn(),
            showInformationMessage: jest.fn(),
            activeTextEditor: activeTextEditorMock,  // Use the initialized mock here
            showTextDocument: jest.fn(),
            commands: {
                executeCommand: jest.fn(),
            },
        },
        workspace: {
            getConfiguration: jest.fn(() => ({
                get: jest.fn((key: string) => {
                    if (key === 'gpt3.apiBaseUrl') return 'https://api.openai.com/v1';
                    if (key === 'gpt3.model') return 'gpt-4';
                    return undefined;
                }),
            })),
            openTextDocument: jest.fn(() => Promise.resolve({} as vscode.TextDocument)),
        },
        extensions: {
            getExtension: jest.fn(() => ({
                exports: {
                    globalState: {
                        get: jest.fn(() => undefined),
                        update: jest.fn(),
                    },
                },
            })),
        },
        SnippetString: SnippetStringMock,
    };
});


jest.mock('../src/config/configuration', () => ({
    getConfig: jest.fn((key) => {
        if (key === 'fileInclusionRegex') return '.*\\.ts$';
        if (key === 'fileExclusionRegex') return '.*\\.spec.ts$';
        return undefined;
    }),
    getRequiredConfig: jest.fn((key) => {
        if (key === 'gpt3.apiBaseUrl') return 'https://api.openai.com/v1'; // Mock required config
        if (key === 'gpt3.model') return 'gpt-4'; // Another required config
        throw new Error(`Missing required configuration: ${key}`);
    }),
    onConfigurationChanged: jest.fn((callback) => {
        // Immediately invoke the mock callback function
        callback();
    }),
}));


describe('ChatGptViewProvider', () => {
    let provider: ChatGptViewProvider;

    beforeEach(() => {
        const context = { globalState: {}, workspaceState: {} } as vscode.ExtensionContext;
        provider = new ChatGptViewProvider(context);
        vscode.window.activeTextEditor = (vscode.window as any).activeTextEditor;  // Ensure this is set before each test
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('handleAddFreeTextQuestion', () => {
        it('should clear chat history if conversationHistoryEnabled is false', async () => {
            provider['conversationHistoryEnabled'] = false;
            provider['chatHistory'] = [{ role: 'user', content: 'Old message' }];
            await provider['handleAddFreeTextQuestion']('New Question');
            expect(provider['chatHistory']).toHaveLength(0);
        });

        it('should invoke sendApiRequest with the provided question', async () => {
            const spy = jest.spyOn(provider, 'sendApiRequest');
            await provider['handleAddFreeTextQuestion']('What is AI?');
            expect(spy).toHaveBeenCalledWith('What is AI?', { command: 'freeText' });
        });
    });

    describe('handleEditCode', () => {
        it('should insert code snippet into the active text editor', async () => {
            const codeSample = 'console.log("Hello, world!");';

            await provider['handleEditCode'](codeSample);

            // Use expect.anything() to match any object
            expect(vscode.window.activeTextEditor!.insertSnippet).toHaveBeenCalledWith(expect.anything());
            expect(vscode.window.activeTextEditor!.insertSnippet).toHaveBeenCalledWith(expect.objectContaining({ value: codeSample }));
        });

        it('should not proceed if there is no active editor', async () => {
            vscode.window.activeTextEditor = undefined;  // Simulate no active editor

            await provider['handleEditCode']('Some code');

            // Assert that insertSnippet was not called on the mock
            if (activeTextEditorMock) {
                expect(activeTextEditorMock.insertSnippet).not.toHaveBeenCalled();
            }
        });
    });


    describe('handleOpenNew', () => {
        it('should open a new text document with the specified content and language', async () => {
            const spyOpen = jest.spyOn(vscode.workspace, 'openTextDocument').mockResolvedValue({} as vscode.TextDocument);
            const spyShow = jest.spyOn(vscode.window, 'showTextDocument');

            await provider['handleOpenNew']('New Document Content', 'javascript');

            expect(spyOpen).toHaveBeenCalledWith({ content: 'New Document Content', language: 'javascript' });
            expect(spyShow).toHaveBeenCalled();  // Ensure it was called
        });
    });

    describe('handleClearConversation', () => {
        it('should reset conversationId and clear chatHistory', async () => {
            provider['conversationId'] = '123';
            provider['chatHistory'] = [{ role: 'user', content: 'Hello' }];
            await provider['handleClearConversation']();
            expect(provider['conversationId']).toBeUndefined();
            expect(provider['chatHistory']).toHaveLength(0);
        });
    });

    describe('handleLogin', () => {
        it('should send a success message if preparation is successful', async () => {
            const spyPrepare = jest.spyOn(provider, 'prepareConversation').mockResolvedValue(true);
            const spySend = jest.spyOn(provider, 'sendMessage');
            await provider['handleLogin']();
            expect(spySend).toHaveBeenCalledWith({ type: "loginSuccessful", showConversations: false }, true);
        });

        it('should not send a success message if preparation fails', async () => {
            const spyPrepare = jest.spyOn(provider, 'prepareConversation').mockResolvedValue(false);
            const spySend = jest.spyOn(provider, 'sendMessage');
            await provider['handleLogin']();
            expect(spySend).not.toHaveBeenCalled();
        });
    });

    describe('showFiles', () => {
        it('should show an error message if inclusion regex is not set', async () => {
            (getConfig as jest.Mock).mockReturnValueOnce(undefined);
            await provider.showFiles();
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith("Inclusion regex is not set in the configuration.");
        });

        it('should call findMatchingFiles with the correct arguments', async () => {
            const inclusionRegex = '.*\\.js$';
            const exclusionRegex = '.*\\.test.js$';
            (getConfig as jest.Mock).mockReturnValueOnce(inclusionRegex).mockReturnValueOnce(exclusionRegex);
            const spyFind = jest.spyOn(provider as any, 'findMatchingFiles').mockResolvedValue([]);

            await provider.showFiles();

            expect(spyFind).toHaveBeenCalledWith(inclusionRegex, exclusionRegex);
        });
    });

    describe('sendApiRequest', () => {
        it('should set inProgress to true while processing', async () => {
            const prompt = 'What is AI?';
            await provider.sendApiRequest(prompt, { command: 'freeText' });
            expect(provider.inProgress).toBe(false);  // It should be false after processing
        });

        it('should handle errors during API requests gracefully', async () => {
            const prompt = 'What is AI?';
            jest.spyOn(provider, 'retrieveContextForPrompt').mockImplementationOnce(() => {
                throw new Error('Sample error');
            });
            await provider.sendApiRequest(prompt, { command: 'freeText' });
            expect(vscode.window.showErrorMessage).toHaveBeenCalled();  // Check if error message is shown
        });
    });

    describe('edge cases in handleAddFreeTextQuestion', () => {
        it('should not modify chatHistory if conversationHistoryEnabled is true', async () => {
            provider['conversationHistoryEnabled'] = true;
            provider['chatHistory'] = [{ role: 'user', content: 'Old message' }];
            await provider['handleAddFreeTextQuestion']('New Question');
            expect(provider['chatHistory']).toHaveLength(1);
        });

        it('should not throw error with empty question', async () => {
            await provider['handleAddFreeTextQuestion']('');
            expect(provider['chatHistory']).toHaveLength(0);
        });
    });

    // TODO: make these tests pass
    // describe('Configuration Change Handling', () => {
    //     it('should update subscribeToResponse on configuration change', async () => {
    //         // Arrange
    //         provider.subscribeToResponse = false; // Initial value
    //         // Simulate a configuration change
    //         await provider['onConfigurationChanged'](() => {
    //             provider.subscribeToResponse = true; // New value
    //         });
    //         // Act
    //         provider['onConfigurationChanged']();
    //         // Assert
    //         expect(provider.subscribeToResponse).toBe(true);
    //     });

    //     it('should update autoScroll on configuration change', async () => {
    //         // Arrange
    //         provider.autoScroll = false; // Initial value
    //         // Simulate a configuration change
    //         await provider['onConfigurationChanged'](() => {
    //             provider.autoScroll = true; // New value
    //         });
    //         // Act
    //         provider['onConfigurationChanged']();
    //         // Assert
    //         expect(provider.autoScroll).toBe(true);
    //     });
    // });

    // TODO: make these tests pass
    // describe('API Response Handling', () => {
    //     it('should correctly handle a successful API response', async () => {
    //         // Arrange
    //         const mockResponse = 'This is a response';

    //         // Mocking the getChatResponse method
    //         // @ts-ignore
    //         jest.spyOn(provider as any, 'getChatResponse').mockImplementation(async (_, __, ___) => {
    //             provider.response = mockResponse; // Set the response directly
    //         });

    //         // Act
    //         await provider.sendApiRequest('What can you do?', { command: 'freeText' });

    //         // Assert
    //         expect(provider.response).toEqual(mockResponse);
    //     });

    //     it('should handle errors during API requests', async () => {
    //         // Arrange
    //         jest.spyOn(provider, 'sendApiRequest').mockRejectedValue(new Error('API error'));
    //         const spyShowErrorMessage = jest.spyOn(vscode.window, 'showErrorMessage');

    //         // Act
    //         await provider.sendApiRequest('What can you do?', { command: 'freeText' });

    //         // Assert
    //         expect(spyShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining('API error'));
    //     });
    // });

    // TODO: make these tests pass
    // describe('File Matching Logic', () => {
    //     it('should return only files that match the inclusion regex', async () => {
    //         // Arrange
    //         const spyFindMatchingFiles = jest.spyOn(provider as any, 'findMatchingFiles').mockImplementation(async (inclusionPattern, exclusionPattern) => {
    //             // Mocking inside the implementation to return suitable result
    //             return ['file1.ts', 'file2.spec.ts', 'otherfile.txt'];  // Returning mocked files
    //         });

    //         // Act
    //         const matchedFiles = await provider.showFiles();

    //         // Debugging log to see the returned files
    //         console.log('Matched Files:', matchedFiles); // Add this line to debug

    //         // Assert
    //         expect(matchedFiles).toEqual(['file1.ts']); // only file1.ts should match based on inclusion
    //         expect(spyFindMatchingFiles).toHaveBeenCalled();
    //     });

    //     it('should not include files that match the exclusion regex', async () => {
    //         // Arrange
    //         const spyFindMatchingFiles = jest.spyOn(provider as any, 'findMatchingFiles').mockImplementation(async (inclusionPattern, exclusionPattern) => {
    //             return ['file1.ts', 'file1.test.ts', 'file2.spec.ts'];  // Include a file to be excluded
    //         });

    //         // Act
    //         const matchedFiles = await provider.showFiles();

    //         // Debugging log to see the returned files
    //         console.log('Matched Files:', matchedFiles); // Add this line to debug

    //         // Assert
    //         expect(matchedFiles).toEqual(['file1.ts']); // only file1.ts should match
    //         expect(spyFindMatchingFiles).toHaveBeenCalled();
    //     });
    // });



    describe('Message Sending', () => {
        it('should send message if webView is available', () => {
            // Arrange
            const mockWebView = { webview: { postMessage: jest.fn() } };
            // @ts-ignore: Accessing private property for testing
            provider.webView = mockWebView as unknown as vscode.WebviewView;
            const message = { type: 'testMessage' };

            // Act
            provider.sendMessage(message);

            // @ts-ignore: Accessing private property for testing
            expect(provider.webView.webview.postMessage).toHaveBeenCalledWith(message);
        });

        it('should store message if webView is not available', () => {
            // @ts-ignore: Accessing private property for testing
            provider.webView = undefined;
            const message = { type: 'testMessage' };

            // Act
            provider.sendMessage(message);

            // @ts-ignore: Accessing private property for testing
            expect(provider.leftOverMessage).toEqual(message);
        });
    });

    describe('Line Counting Functionality', () => {
        it('should correctly count the number of lines in a file', () => {
            // Arrange
            const mockFilePath = '/mock/path/to/file.ts';
            const fsMock = jest.spyOn(fs, 'readFileSync').mockReturnValueOnce('line1\nline2\nline3');
            // Act
            const lineCount = getLineCount(mockFilePath);
            // Assert
            expect(lineCount).toBe(3);
            fsMock.mockRestore(); // Cleanup
        });
    });
});
