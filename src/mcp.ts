import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { jsonSchema, type Tool } from "ai";
import { EventSource } from "eventsource";
import { logger } from "./logger";

// define EventSource globally for SSE transport
globalThis.EventSource = EventSource;

export type MCPServerConfig = {
  mcpServers: {
    [key: string]: {
      command: string;
      args: string[];
      url: string;
      env?: Record<string, string>;
      isEnabled: boolean;
      type: string; // "sse", "stdio", or "streamable-http"
      headers?: Record<string, string>; // Added headers for HTTP/SSE requests
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
    result: string | Promise<string>,
  ) => void;

  /**
   * Optional callback that will be called during MCP server initialization
   * Useful for showing status updates to the user
   */
  onServerStatus?: (
    serverName: string,
    status: "starting" | "connected" | "error",
    toolCount?: number,
    error?: string,
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
};

/**
 * Creates an MCP client with the appropriate transport based on server type
 */
async function createMCPClientForServer(
  serverName: string,
  serverConfig: MCPServerConfig["mcpServers"][string],
): Promise<Client> {
  let transport: Transport;

  if (serverConfig.type === "sse") {
    transport = new SSEClientTransport(new URL(serverConfig.url), {
      eventSourceInit: {
        headers: serverConfig.headers,
      } as any,
    });
  } else if (serverConfig.type === "streamable-http") {
    // Use StreamableHTTPClientTransport from MCP SDK as custom transport
    transport = new StreamableHTTPClientTransport(new URL(serverConfig.url), {
      requestInit: {
        headers: serverConfig.headers,
      },
    }) as Transport;
  } else {
    // Use stdio transport
    transport = new StdioClientTransport({
      command: serverConfig.command,
      args: serverConfig.args,
      env: {
        ...serverConfig.env,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
      },
      stderr: "pipe",
    });
  }

  const client = new Client(
    {
      name: "chatgpt-copilot",
      version: "1.0.0",
    },
    {
      capabilities: {},
    },
  );

  await client.connect(transport);
  return client;
}

/**
 * Creates a set of tools from MCP servers that can be used with the AI SDK
 * Uses the official AI SDK MCP client support
 * @param config Configuration for the tool set
 * @returns A promise that resolves to the tool set
 */
export async function createToolSet(config: MCPServerConfig): Promise<ToolSet> {
  const toolset: ToolSet = {
    tools: {},
    clients: {},
  };

  // Initialize all server connections and fetch their tools
  for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
    if (!serverConfig.isEnabled) {
      continue;
    }

    try {
      // Report server is starting
      if (config.onServerStatus) {
        config.onServerStatus(serverName, "starting");
      }

      const client = await createMCPClientForServer(serverName, serverConfig);
      toolset.clients[serverName] = client;

      // Get tools from the MCP client
      const result = await client.listTools();
      const mcpTools = result.tools;

      // Add tools to the toolset
      for (const toolDef of mcpTools) {
        const toolName = toolDef.name;

        const tool: Tool = {
          description: toolDef.description,
          inputSchema: jsonSchema(toolDef.inputSchema),
          execute: async (args: any, options: any) => {
            try {
              const result = await client.callTool({
                name: toolName,
                arguments: args,
              });

              // Log the tool call with the result
              if (config.onCallTool) {
                const strResult = JSON.stringify(result);
                config.onCallTool(serverName, toolName, args, strResult);
              }

              return result;
            } catch (error) {
              logger.appendLine(
                `ERROR: Tool execution failed for ${toolName}: ${error}`,
              );
              throw error;
            }
          },
        };

        toolset.tools[toolName] = tool;
      }

      logger.appendLine(
        `INFO: MCP server ${serverName} connected with ${mcpTools.length} tools`,
      );

      // Report server successfully connected with tool count
      if (config.onServerStatus) {
        config.onServerStatus(serverName, "connected", mcpTools.length);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.appendLine(
        `ERROR: MCP server ${serverName} failed: ${errorMessage}`,
      );

      // Report server connection error
      if (config.onServerStatus) {
        config.onServerStatus(serverName, "error", undefined, errorMessage);
      }
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
    try {
      await client.close();
    } catch (error) {
      logger.appendLine(`ERROR: Failed to close MCP client: ${error}`);
    }
  }
}
