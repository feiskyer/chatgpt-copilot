import {
  experimental_createMCPClient as createMCPClient,
  experimental_MCPClient as MCPClient,
  MCPTransport,
  type Tool,
} from "ai";
import { Experimental_StdioMCPTransport as StdioMCPTransport } from "ai/mcp-stdio";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
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
};

/**
 * The resulting tool set with tools and clients
 */
export type ToolSet = {
  tools: {
    [key: string]: Tool;
  };
  clients: {
    [key: string]: MCPClient;
  };
};

/**
 * Creates an MCP client with the appropriate transport based on server type
 */
async function createMCPClientForServer(
  serverName: string,
  serverConfig: MCPServerConfig["mcpServers"][string],
): Promise<MCPClient> {
  let transport:
    | MCPTransport
    | { type: "sse"; url: string; headers?: Record<string, string> };

  if (serverConfig.type === "sse") {
    // Use AI SDK's built-in SSE transport
    transport = {
      type: "sse",
      url: serverConfig.url,
      headers: serverConfig.headers,
    };
  } else if (serverConfig.type === "streamable-http") {
    // Use StreamableHTTPClientTransport from MCP SDK as custom transport
    transport = new StreamableHTTPClientTransport(new URL(serverConfig.url), {
      requestInit: {
        headers: serverConfig.headers,
      },
    }) as MCPTransport;
  } else {
    // Use built-in stdio transport from AI SDK
    transport = new StdioMCPTransport({
      command: serverConfig.command,
      args: serverConfig.args,
      env: {
        ...serverConfig.env,
        ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
      },
      stderr: "pipe",
    });
  }

  const client = await createMCPClient({ transport });
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
      const client = await createMCPClientForServer(serverName, serverConfig);
      toolset.clients[serverName] = client;

      // Get tools from the MCP client
      // Use schema discovery approach for dynamic tools
      const mcpTools = await client.tools();

      // Add tools to the toolset - the tools already have proper execute functions
      for (const [toolName, tool] of Object.entries(mcpTools)) {
        // The tool from client.tools() already has the correct structure
        // We just need to wrap it to add logging if needed
        if (config.onCallTool && tool.execute) {
          const originalExecute = tool.execute;
          tool.execute = async (args: any, options: any) => {
            try {
              const result = await originalExecute(args, options);

              // Log the tool call with the result
              if (config.onCallTool) {
                const strResult =
                  typeof result === "string" ? result : JSON.stringify(result);
                config.onCallTool(serverName, toolName, args, strResult);
              }

              // Return the original result unchanged
              return result;
            } catch (error) {
              logger.appendLine(
                `ERROR: Tool execution failed for ${toolName}: ${error}`,
              );
              throw error;
            }
          };
        }

        toolset.tools[toolName] = tool;
      }

      logger.appendLine(
        `INFO: MCP server ${serverName} connected with ${Object.keys(mcpTools).length} tools`,
      );
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
    try {
      await client.close();
    } catch (error) {
      logger.appendLine(`ERROR: Failed to close MCP client: ${error}`);
    }
  }
}
