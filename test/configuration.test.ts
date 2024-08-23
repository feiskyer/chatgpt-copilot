// test/configuration.test.ts

import * as vscode from 'vscode';
import { getConfig, getRequiredConfig } from "../src/config/configuration";

// Mock the vscode module for consistency
jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: jest.fn((namespace: string) => ({
            get: jest.fn((key: string) => {
                if (key === 'testKey') {
                    return undefined;
                }
                return 'fakeValue'; // Default value for demonstration
            }),
        })),
    },
    window: {
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn(),
    },
}));

describe('getConfig', () => {
    afterEach(() => {
        jest.clearAllMocks(); // Clear mocks after each test
    });

    it('should return default value if config value is undefined', () => {
        const result = getConfig<string>('testKey', 'defaultValue');
        expect(result).toBe('defaultValue');
    });

    it('should return the config value if it is defined', () => {
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValueOnce({
            get: jest.fn().mockReturnValue('someValue'),
        });

        const result = getConfig<string>('testKey');
        expect(result).toBe('someValue');
    });

    it('should return typed value from configuration', () => {
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn().mockReturnValue(42), // Mock for numeric type
        });

        const result = getConfig<number>('testKey');
        expect(result).toBe(42);
    });

    it('should handle when no default value is provided and config is undefined', () => {
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn().mockReturnValue(undefined),
        });

        expect(() => getConfig<string>('nonExistentKey')).not.toThrow();
    });

    it('should throw an error when required config value is not present', () => {
        expect(() => getRequiredConfig<any>('nonExistentKey')).toThrowError();
    });
});
