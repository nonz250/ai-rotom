import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SERVER_INSTRUCTIONS } from "./instructions.js";
import { registerDamageCalculationTools } from "./tools/damage-calculation.js";
import { registerMatchupTool } from "./tools/matchup.js";
import { registerPartyAnalysisTool } from "./tools/party-analysis.js";
import { registerPokemonInfoTools } from "./tools/pokemon-info.js";
import { registerStatsCalculationTool } from "./tools/stats-calculation.js";

const SERVER_NAME = "ai-rotom";
const SERVER_VERSION = "0.0.1";

export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  registerDamageCalculationTools(server);
  registerMatchupTool(server);
  registerPartyAnalysisTool(server);
  registerPokemonInfoTools(server);
  registerStatsCalculationTool(server);

  return server;
}

export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
