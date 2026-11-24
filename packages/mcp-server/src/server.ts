import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createCoreServer } from "./core-server.js";
import { SERVER_INSTRUCTIONS } from "./instructions.js";
import { registerImportPartyFromTextTool } from "./tools/party/import-party-from-text.js";
import { registerPartyTools } from "./tools/party/party-tools.js";

export function createServer(): McpServer {
  const server = createCoreServer(SERVER_INSTRUCTIONS);
  registerImportPartyFromTextTool(server);
  registerPartyTools(server);

  return server;
}

export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
