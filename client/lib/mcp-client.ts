import { experimental_createMCPClient as createMCPClient } from 'ai';
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";


export interface KeyValuePair {
  key: string;
  value: string;
}

/**
 * MCP Server Configuration
 * 
 * Updated to use 'streamable-http' transport type as per MCP specification 2025-06-18.
 * This replaces the deprecated 'sse' transport type.
 * 
 * Current implementation temporarily maps 'streamable-http' to 'sse' in the transport
 * layer until the AI SDK supports the new Streamable HTTP transport.
 */
export interface MCPServerConfig {
  url: string;
  type: 'streamable-http' | 'stdio';
  command?: string;
  args?: string[];
  env?: KeyValuePair[];
  headers?: KeyValuePair[];
}

export interface MCPClientManager {
  tools: Record<string, any>;
  clients: any[];
  cleanup: () => Promise<void>;
}

/**
 * Initialize MCP clients for API calls
 * 
 * This function handles both 'streamable-http' and 'stdio' transport types.
 * For streamable-http, it uses the proper StreamableHTTPClientTransport from MCP SDK.
 */
export async function initializeMCPClients(
  mcpServers: MCPServerConfig[] = [],
  abortSignal?: AbortSignal
): Promise<MCPClientManager> {
  // Initialize tools
  let tools = {};
  const mcpClients: any[] = [];

  // Process each MCP server configuration
  for (const mcpServer of mcpServers) {
    try {
      let transport;
      
      if (mcpServer.type === 'streamable-http') {
        // Use proper StreamableHTTPClientTransport for streamable-http
        transport = new StreamableHTTPClientTransport(
          new URL(mcpServer.url)
        );
      } else if (mcpServer.type === 'stdio') {
        // Use proper StdioClientTransport for stdio
        transport = new StdioClientTransport({
          command: mcpServer.command!,
          args: mcpServer.args!,
          env: mcpServer.env?.reduce((acc, envVar) => {
            if (envVar.key) acc[envVar.key] = envVar.value || '';
            return acc;
          }, {} as Record<string, string>)
        });
      } else {
        console.warn(`Unsupported transport type: ${mcpServer.type}`);
        continue;
      }

      const mcpClient = await createMCPClient({ transport });
      mcpClients.push(mcpClient);

      const mcptools = await mcpClient.tools();

      const serverIdentifier = mcpServer.url || mcpServer.command || 'unknown-server';
      console.log(`MCP tools from ${serverIdentifier}:`, Object.keys(mcptools));
      console.log(`Tools loaded from ${serverIdentifier}:`, Object.keys(mcptools).map(toolName => ({
        name: toolName,
        source: serverIdentifier,
        description: mcptools[toolName]?.description || 'No description available'
      })));

      // Add MCP tools to tools object
      tools = { ...tools, ...mcptools };
    } catch (error) {
      console.error("Failed to initialize MCP client:", error);
      // Continue with other servers instead of failing the entire request
    }
  }

  // Register cleanup for all clients if an abort signal is provided
  if (abortSignal && mcpClients.length > 0) {
    abortSignal.addEventListener('abort', async () => {
      await cleanupMCPClients(mcpClients);
    });
  }

  return {
    tools,
    clients: mcpClients,
    cleanup: async () => await cleanupMCPClients(mcpClients)
  };
}

async function cleanupMCPClients(clients: any[]): Promise<void> {
  // Clean up the MCP clients
  for (const client of clients) {
    try {
      await client.close();
    } catch (error) {
      console.error("Error closing MCP client:", error);
    }
  }
} 