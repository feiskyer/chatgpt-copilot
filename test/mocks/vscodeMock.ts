// test/mocks/vscodeMock.ts

export const mockGetConfiguration = jest.fn().mockReturnValue({
    get: jest.fn((key: string, defaultValue?: any) => {
        // Simulating undefined value for 'testKey'
        if (key === 'testKey') {
            return undefined; // Mimics a missing configuration
        }
        return defaultValue; // Return default value for keys not specifically handled
    }),
});

export const workspace = {
    getConfiguration: mockGetConfiguration,
    onDidChangeConfiguration: jest.fn(),
};

export const window = {
    showErrorMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    showInputBox: jest.fn(),
    createOutputChannel: jest.fn(() => ({
        appendLine: jest.fn(),
    })),
};

export const Uri = {
    joinPath: jest.fn(),
};

// Add other exports from 'vscode' that you might need in your tests.

