import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SERVER_INSTRUCTIONS } from "./instructions.js";
import { registerAbilityInfoTool } from "./tools/ability-info.js";
import { registerConditionInfoTool } from "./tools/condition-info.js";
import { registerDamageCalculationTools } from "./tools/damage-calculation.js";
import { registerDamageRangeTool } from "./tools/damage-range.js";
import { registerFindCountersTool } from "./tools/find-counters.js";
import { registerItemInfoTool } from "./tools/item-info.js";
import { registerLearnsetTool } from "./tools/learnset.js";
import { registerMatchupTool } from "./tools/matchup.js";
import { registerMoveInfoTool } from "./tools/move-info.js";
import { registerNatureInfoTool } from "./tools/nature-info.js";
import { registerPartyAnalysisTool } from "./tools/party-analysis.js";
import { registerPartyCoverageTool } from "./tools/party-coverage.js";
import { registerPokemonInfoTools } from "./tools/pokemon-info.js";
import { registerPokemonSummaryTool } from "./tools/pokemon-summary.js";
import { registerSearchByAbilityTool } from "./tools/search-by-ability.js";
import { registerSearchByMoveTool } from "./tools/search-by-move.js";
import { registerSearchByTypeEffectivenessTool } from "./tools/search-by-type-effectiveness.js";
import { registerSelectionAnalysisTool } from "./tools/selection-analysis.js";
import { registerSpeedTiersTool } from "./tools/speed-tiers.js";
import { registerStatsCalculationTool } from "./tools/stats-calculation.js";
import { registerTypeInfoTool } from "./tools/type-info.js";

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

  registerAbilityInfoTool(server);
  registerConditionInfoTool(server);
  registerDamageCalculationTools(server);
  registerDamageRangeTool(server);
  registerFindCountersTool(server);
  registerItemInfoTool(server);
  registerLearnsetTool(server);
  registerMatchupTool(server);
  registerMoveInfoTool(server);
  registerNatureInfoTool(server);
  registerPartyAnalysisTool(server);
  registerPartyCoverageTool(server);
  registerPokemonInfoTools(server);
  registerPokemonSummaryTool(server);
  registerSearchByAbilityTool(server);
  registerSearchByMoveTool(server);
  registerSearchByTypeEffectivenessTool(server);
  registerSelectionAnalysisTool(server);
  registerSpeedTiersTool(server);
  registerStatsCalculationTool(server);
  registerTypeInfoTool(server);

  return server;
}

export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
