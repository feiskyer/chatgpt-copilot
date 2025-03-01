import { CoreMessage } from "ai";
import * as vscode from "vscode";
import ChatGptViewProvider, { logger } from "./chatgpt-view-provider";

export async function chatCopilot(provider: ChatGptViewProvider, question: string, images: Record<string, string>, startResponse: () => void, updateResponse: (message: string) => void) {
    // logger.appendLine(`INFO: chatgpt.model: ${provider.model} chatgpt.question: ${question}`);
    const models = await vscode.lm.selectChatModels({
        vendor: 'copilot'
    });
    // logger.appendLine(`INFO: available models: ${models.map(m => m.family).join(', ')}`);
    if (models.length === 0) {
        provider.sendMessage({
            type: "addError",
            value: `No supported models found.`,
            autoScroll: provider.autoScroll,
        });
        return;
    }

    let model: vscode.LanguageModelChat | undefined;
    try {
        [model] = await vscode.lm.selectChatModels({
            vendor: 'copilot',
            family: provider.model
        });
    } catch (err) {
        provider.sendMessage({
            type: "addError",
            value: JSON.stringify(err, null, 2),
            autoScroll: provider.autoScroll,
        });
        logger.appendLine(`ERROR: ${err}`);
        return;
    }

    if (!model) {
        provider.sendMessage({
            type: "addError",
            value: `Model ${provider.model} not supported.`,
            autoScroll: provider.autoScroll,
        });
        logger.appendLine(`ERROR: Model ${provider.model} not supported.`);
        return;
    }

    let chatResponse: vscode.LanguageModelChatResponse | undefined;
    provider.chatHistory.push({ role: "user", content: question });
    const messages = convertToLMChatMessages(provider.chatHistory);
    // logger.appendLine(`DEBUG: chatgpt.history: ${JSON.stringify(provider.chatHistory)}`);
    // logger.appendLine(`DEBUG: chatgpt.messages: ${JSON.stringify(messages)}`);

    /* placeholder for response */
    startResponse();

    try {
        chatResponse = await model.sendRequest(
            messages,
            {},
            new vscode.CancellationTokenSource().token
        );
    } catch (err) {
        provider.sendMessage({
            type: "addError",
            value: JSON.stringify(err, null, 2),
            autoScroll: provider.autoScroll,
        });
        logger.appendLine(`ERROR: ${err}`);
        return;
    }

    const chunks = [];
    try {
        for await (const fragment of chatResponse.text) {
            updateResponse(fragment);
            chunks.push(fragment);
        }
    } catch (err) {
        provider.sendMessage({
            type: "addError",
            value: JSON.stringify(err, null, 2),
            autoScroll: provider.autoScroll,
        });
        logger.appendLine(`ERROR: ${err}`);
        return;
    }

    provider.response = chunks.join("");
    provider.chatHistory.push({ role: "assistant", content: chunks.join("") });
    logger.appendLine(`INFO: chatgpt.response: ${provider.response}`);
}

function convertToLMChatMessages(messages: CoreMessage[]): vscode.LanguageModelChatMessage[] {
    return messages.map((message) => {
        switch (message.role) {
            case "user":
                return vscode.LanguageModelChatMessage.User(message.content as string);
            case "assistant":
                return vscode.LanguageModelChatMessage.Assistant(message.content as string);
            case "system":
                return vscode.LanguageModelChatMessage.User(message.content as string);
            case "tool":
                return vscode.LanguageModelChatMessage.User(JSON.stringify(message.content));
            default:
                throw new Error(`Unknown role for ${JSON.stringify(message)}`);
        }
    });
}