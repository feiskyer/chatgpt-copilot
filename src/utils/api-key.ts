// utils/api-key.ts
import * as vscode from 'vscode';

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
            'Please add your API Key to use OpenAI official APIs. Storing the API Key in Settings is discouraged due to security reasons, though you can still opt-in to use it to persist it in settings. Instead you can also temporarily set the API Key one-time: You will need to re-enter after restarting the vs-code.',
            'Store in session (Recommended)',
            'Open settings',
        );

        if (choice === 'Open settings') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'chatgpt.gpt3.apiKey');
            return undefined;
        } else if (choice === 'Store in session (Recommended)') {
            const value = await vscode.window.showInputBox({
                title: 'Store OpenAI API Key in session',
                prompt: 'Please enter your OpenAI API Key to store in your session only. This option won’t persist the token on your settings.json file. You may need to re-enter after restarting your VS-Code',
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
