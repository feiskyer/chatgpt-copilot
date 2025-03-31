import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Tool } from "ai";
import { jsonSchema, tool } from "ai";
import { JSONSchema7 } from "json-schema";
import { logger } from "./logger";

export type MCPServerConfig = {
    mcpServers: {
        [key: string]: {
            command: string;
            args: string[];
            url: string;
            env?: Record<string, string>;
            isEnabled: boolean;
            type: string;
        };
    };

    /**
     * Optional callback that will be called when a tool is executed
     * Useful for timing, logging, or other instrumentation
     */
    onCallTool?: (
        serverName: string,
        toolName: string,
        args: any,
        result: string | Promise<string>
    ) => void;
};

/**
 * The resulting tool set with tools and clients
 */
export type ToolSet = {
    tools: {
        [key: string]: Tool;
    };
    clients: {
        [key: string]: Client;
    };
    transports: {
        [key: string]: Transport;
    };
};



/**
 * Creates a set of tools from MCP servers that can be used with the AI SDK
 * @param config Configuration for the tool set
 * @returns A promise that resolves to the tool set
 */
export async function createToolSet(config: MCPServerConfig): Promise<ToolSet> {
    let toolset: ToolSet = {
        tools: {},
        clients: {},
        transports: {},
    };

    // Initialize all server connections and fetch their tools
    for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
        if (!serverConfig.isEnabled) {
            continue;
        }

        let transport: Transport;
        try {
            if (serverConfig.type === "sse") {
                // Refer https://github.com/modelcontextprotocol/typescript-sdk/issues/213#issuecomment-2758113743 for workarounds.
                transport = new SSEClientTransport(new URL(serverConfig.url));
            } else {
                transport = new StdioClientTransport({
                    command: serverConfig.command,
                    args: serverConfig.args,
                    env: {
                        ...serverConfig.env,
                        ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
                    },
                    stderr: "pipe",
                });
            }

            transport.onerror = async (error) => {
                logger.appendLine(`ERROR: MCP server ${serverName} error: ${error}`);
                await transport.close();
            };
            toolset.transports[serverName] = transport;
            await transport.start();
            transport.start = async () => { }; // No-op now, .connect() won't fail

            const client = new Client(
                {
                    name: `${serverName}-client`,
                    version: "1.0.0",
                },
                {
                    capabilities: {},
                }
            );
            toolset.clients[serverName] = client;
            await client.connect(transport);

            // Get list of tools and add them to the toolset
            const toolList = await client.listTools();
            for (const t of toolList.tools) {
                let toolName = t.name;
                // Prefix tool names with server name to avoid collisions,
                // unless the tool name is already the server name
                if (toolName !== serverName) {
                    toolName = `${serverName}-${toolName}`;
                }

                const parameters = jsonSchema(t.inputSchema as JSONSchema7);
                toolset.tools[toolName] = tool({
                    description: t.description || toolName,
                    parameters: parameters,
                    execute: async (args) => {
                        const result = await client.callTool({
                            name: t.name,
                            arguments: args as Record<string, any>,
                        });
                        const strResult = JSON.stringify(result);
                        if (config.onCallTool) {
                            config.onCallTool(serverName, toolName, args, strResult);
                        }
                        return strResult;
                    },
                });
            }

        } catch (error) {
            logger.appendLine(`ERROR: MCP server ${serverName} failed: ${error}`);
            continue;
        }
    }

    return toolset;
}

/**
 * Closes all clients in a tool set
 * @param toolSet The tool set to close
 */
export async function closeToolSet(toolSet: ToolSet): Promise<void> {
    for (const client of Object.values(toolSet.clients)) {
        await client.close();
    }
}
