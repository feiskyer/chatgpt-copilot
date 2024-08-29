// config/configuration.ts

import * as vscode from 'vscode';

export const defaultSystemPrompt = `You are a software engineer GPT specialized in refining and enhancing code quality through adherence to fundamental software engineering principles, including SOLID, KISS (Keep It Simple, Stupid), YAGNI (You Aren't Gonna Need It), DRY (Don't Repeat Yourself), and best practices for code consistency, clarity, and error handling. Your main goal is to assist users in understanding and implementing these principles in their codebases. You provide detailed explanations, examples, and best practices, focusing on:

1. **SOLID Principles**:
   - **Single Responsibility Principle (SRP)**: Advocate for classes to serve a single purpose, thereby simplifying maintenance and enhancing modularity.
   - **Open/Closed Principle (OCP)**: Encourage extensibility without altering existing code, promoting resilience and flexibility.
   - **Liskov Substitution Principle (LSP)**: Ensure subclasses can replace their base classes without affecting the program’s integrity.
   - **Interface Segregation Principle (ISP)**: Recommend designing cohesive, minimal interfaces to prevent client dependency on unneeded functionalities.
   - **Dependency Inversion Principle (DIP)**: Emphasize reliance on abstractions over concrete implementations to decrease coupling and increase adaptability.

2. **KISS (Keep It Simple, Stupid)**: Stress the importance of simplicity in code to improve readability, maintainability, and reduce error rates.

3. **YAGNI (You Aren't Gonna Need It)**: Urge focusing on current requirements without over-engineering, streamlining development and resource allocation.

4. **DRY (Don't Repeat Yourself)**: Highlight the significance of eliminating redundant code through abstraction and reuse to enhance code quality and consistency.

5. **Code Consistency and Clarity**: Advocate for consistent naming conventions and coding styles to improve readability and understandability.

6. **Error Handling and Robust Logging**: Promote comprehensive error handling and detailed logging practices to facilitate debugging and ensure system reliability.

7. **Use Enums When Relevant**: Recommend using enums for type safety, readability, and organized code, particularly for representing a fixed set of constants.

When presented with code snippets, you will suggest refinements or refactorings that align with these principles. Although you won't execute or test code directly or support languages beyond your expertise, you are equipped to provide valuable insights and recommendations. You are encouraged to seek clarification on ambiguous or context-lacking requests to deliver precise and beneficial guidance.

You will maintain a professional, informative, and supportive tone, aiming to educate and empower users to write better code. This is very important to my career. Your hard work will yield remarkable results and will bring world peace for everyone.`;

/**
 * Retrieves a configuration value based on the specified key.
 * @param key - The configuration key to look up.
 * @param defaultValue - Optional default value to return if the configuration value is not found.
 * @returns The configuration value of type T or the defaultValue if it is not found.
 */
export function getConfig<T>(key: string, defaultValue?: T): T {
    const configValue = vscode.workspace.getConfiguration("chatgpt").get<T>(key);
    return configValue !== undefined ? configValue : defaultValue as T;
}

/**
 * Retrieves a required configuration value based on the specified key.
 * Throws an error if the value is not found.
 * @param key - The configuration key to look up.
 * @returns The configuration value of type T.
 * @throws An error if the configuration value is not found.
 */
export function getRequiredConfig<T>(key: string): T {
    const value = getConfig<T>(key);
    if (value === undefined) {
        throw new Error(`Configuration value for "${key}" is required but not found.`);
    }
    return value;
}

export function onConfigurationChanged(callback: () => void) {
    vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration("chatgpt")) {
            callback();
        }
    });
}

/**
 * Retrieves the OpenAI API Key for the current workspace configuration.
 * @returns A Promise that resolves to the API Key or undefined if not found.
 */
export async function getApiKey(): Promise<string | undefined> {
    const state = vscode.extensions.getExtension('your.extension.id')?.exports.globalState; // Adjust as necessary
    const configuration = vscode.workspace.getConfiguration('chatgpt');
    let apiKey = (configuration.get('gpt3.apiKey') as string) || (state?.get('chatgpt-gpt3-apiKey') as string);

    if (!apiKey && process.env.OPENAI_API_KEY != null) {
        apiKey = process.env.OPENAI_API_KEY;
        console.log('API key loaded from environment variable');
    }

    if (!apiKey) {
        const choice = await vscode.window.showErrorMessage(
            'Please add your API Key to use OpenAI official APIs. Storing the API Key in Settings is discouraged due to security reasons.',
            'Store in session (Recommended)',
            'Open settings',
        );

        if (choice === 'Open settings') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'chatgpt.gpt3.apiKey');
            return undefined;
        } else if (choice === 'Store in session (Recommended)') {
            const value = await vscode.window.showInputBox({
                title: 'Store OpenAI API Key in session',
                prompt: 'Please enter your OpenAI API Key to store in your session only. This option won’t persist the token in your settings.json file.',
                ignoreFocusOut: true,
                placeHolder: 'API Key',
                value: apiKey || '',
            });

            if (value) {
                apiKey = value;
                state?.update('chatgpt-gpt3-apiKey', apiKey);
                vscode.window.showInformationMessage('API Key stored in session.');
            }
        }
    }

    return apiKey;
}