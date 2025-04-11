import { CoreMessage } from "ai";
import * as vscode from "vscode";
import ChatGptViewProvider from "./chatgpt-view-provider";
import { logger } from "./logger";

// /**
//  * Register MCP tools as Language Model tools in VS Code
//  * @param context VS Code extension context
//  * @param toolSet MCP Tool Set
//  */
// export function registerMCPToolsWithVSCode(
//     context: vscode.ExtensionContext,
//     toolSet: ToolSet
// ): vscode.Disposable[] {
//     const disposables: vscode.Disposable[] = [];

//     // Register each MCP tool as a VS Code Language Model tool
//     for (const [toolName, mcpTool] of Object.entries(toolSet.tools)) {
//         try {
//             // Create a tool implementation that conforms to VS Code's LanguageModelTool interface
//             const vscodeToolWrapper = new MCPToolWrapper(toolName, mcpTool);

//             // Register the tool with VS Code
//             const disposable = vscode.lm.registerTool(`${toolName}`, vscodeToolWrapper);
//             disposables.push(disposable);
//             logger.appendLine(`INFO: Registered MCP tool ${toolName} with VS Code Language Model API`);
//         } catch (error) {
//             logger.appendLine(`ERROR: Failed to register MCP tool ${toolName} with VS Code: ${error}`);
//         }
//     }

//     return disposables;
// }

// /**
//  * A wrapper class that adapts MCP tools to the VS Code LanguageModelTool interface
//  */
// class MCPToolWrapper implements vscode.LanguageModelTool<any> {
//     private name: string;
//     private mcpTool: any;

//     constructor(name: string, mcpTool: any) {
//         this.name = name;
//         this.mcpTool = mcpTool;
//     }

//     /**
//      * Invokes the MCP tool with the provided parameters
//      */
//     async invoke(
//         options: vscode.LanguageModelToolInvocationOptions<any>,
//         token: vscode.CancellationToken
//     ): Promise<vscode.LanguageModelToolResult> {
//         try {
//             // Execute the underlying MCP tool
//             if (this.mcpTool.execute) {
//                 const result = await this.mcpTool.execute(options.input, {});
//                 const strResult = typeof result === 'string' ? result : JSON.stringify(result);

//                 // Return the result as a Language Model Tool Result
//                 return new vscode.LanguageModelToolResult([
//                     new vscode.LanguageModelTextPart(strResult)
//                 ]);
//             } else {
//                 throw new Error('Tool execution method not found');
//             }
//         } catch (error) {
//             logger.appendLine(`ERROR: MCP tool execution failed: ${error}`);

//             // Return the error as a Language Model Tool Result
//             return new vscode.LanguageModelToolResult([
//                 new vscode.LanguageModelTextPart(`Error executing tool: ${error}`)
//             ]);
//         }
//     }

//     /**
//      * Prepares tool invocation with optional confirmation message
//      */
//     async prepareInvocation(
//         options: vscode.LanguageModelToolInvocationPrepareOptions<any>,
//         token: vscode.CancellationToken
//     ) {
//         // Create a confirmation message if appropriate
//         const confirmationMessages = {
//             title: `Execute MCP tool: ${this.name}`,
//             message: new vscode.MarkdownString(
//                 `Execute MCP tool '${this.name}'?` +
//                 (options.input ? `\n\n\`\`\`json\n${JSON.stringify(options.input, null, 2)}\n\`\`\`\n` : '')
//             ),
//         };

//         return {
//             invocationMessage: `Executing MCP tool: ${this.name}`,
//             confirmationMessages,
//         };
//     }
// }

export async function chatCopilot(
  provider: ChatGptViewProvider,
  question: string,
  images: Record<string, string>,
  startResponse: () => void,
  updateResponse: (message: string) => void,
) {
  // logger.appendLine(`INFO: chatgpt.model: ${provider.model} chatgpt.question: ${question}`);
  const models = await vscode.lm.selectChatModels({
    vendor: "copilot",
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
      vendor: "copilot",
      family: provider.model,
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

  // const tools = [...vscode.lm.tools];
  // // Cannot have more than 128 tools per request, so only keep the first 128.
  // if (tools.length > 128) {
  //     tools.splice(128);
  // }
  try {
    // Simply use the tools that are already registered with VS Code
    // MCP tools are registered in extension.ts and automatically available here
    chatResponse = await model.sendRequest(
      messages,
      {
        // tools: tools,
      },
      new vscode.CancellationTokenSource().token,
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

function convertToLMChatMessages(
  messages: CoreMessage[],
): vscode.LanguageModelChatMessage[] {
  return messages.map((message) => {
    switch (message.role) {
      case "user":
        return vscode.LanguageModelChatMessage.User(message.content as string);
      case "assistant":
        return vscode.LanguageModelChatMessage.Assistant(
          message.content as string,
        );
      case "system":
        return vscode.LanguageModelChatMessage.User(message.content as string);
      case "tool":
        return vscode.LanguageModelChatMessage.User(
          JSON.stringify(message.content),
        );
      default:
        throw new Error(`Unknown role for ${JSON.stringify(message)}`);
    }
  });
}
