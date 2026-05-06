import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SERVER_INSTRUCTIONS } from "./instructions.js";
import { registerAbilityInfoTool } from "./tools/info/ability-info.js";
import { registerComparePartiesTool } from "./tools/analysis/compare-parties.js";
import { registerConditionInfoTool } from "./tools/info/condition-info.js";
import { registerDamageCalculationTools } from "./tools/calc/damage-calculation.js";
import { registerDamageRangeTool } from "./tools/calc/damage-range.js";
import { registerFindCountersTool } from "./tools/analysis/find-counters.js";
import { registerImportPartyFromTextTool } from "./tools/party/import-party-from-text.js";
import { registerItemInfoTool } from "./tools/info/item-info.js";
import { registerLearnsetTool } from "./tools/info/learnset.js";
import { registerMatchupTool } from "./tools/analysis/matchup.js";
import { registerMoveInfoTool } from "./tools/info/move-info.js";
import { registerNatureInfoTool } from "./tools/info/nature-info.js";
import { registerPartyAnalysisTool } from "./tools/analysis/party-analysis.js";
import { registerPartyCoverageTool } from "./tools/analysis/party-coverage.js";
import { registerPartyTools } from "./tools/party/party-tools.js";
import { registerPokemonInfoTools } from "./tools/info/pokemon-info.js";
import { registerPokemonSummaryTool } from "./tools/info/pokemon-summary.js";
import { registerSearchByAbilityTool } from "./tools/search/search-by-ability.js";
import { registerSearchByMoveTool } from "./tools/search/search-by-move.js";
import { registerSearchByTypeEffectivenessTool } from "./tools/search/search-by-type-effectiveness.js";
import { registerSelectionAnalysisTool } from "./tools/analysis/selection-analysis.js";
import { registerSpeedTiersTool } from "./tools/calc/speed-tiers.js";
import { registerStatsCalculationTool } from "./tools/calc/stats-calculation.js";
import { registerTypeInfoTool } from "./tools/info/type-info.js";
// pokechamp 由来の追加ツール (フォーク統合)。upstream マージ性のため新規ファイル化。
import { registerFetchMetaTopTool } from "./tools/meta/fetch-meta-top.js";
import { registerFetchPokemonMetaTool } from "./tools/meta/fetch-pokemon-meta.js";
import { registerFetchTypicalSetTool } from "./tools/meta/fetch-typical-set.js";
import { registerWarmMetaCacheTool } from "./tools/meta/warm-meta-cache.js";
import { registerCalculateDamageWithProtectionTool } from "./tools/calc/damage-with-protection.js";
import { registerVerifyClaimsTool } from "./tools/analysis/verify-claims.js";
import { registerAnalyzePartyVsMetaTool } from "./tools/analysis/analyze-party-vs-meta.js";

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
  registerComparePartiesTool(server);
  registerConditionInfoTool(server);
  registerDamageCalculationTools(server);
  registerDamageRangeTool(server);
  registerFindCountersTool(server);
  registerImportPartyFromTextTool(server);
  registerItemInfoTool(server);
  registerLearnsetTool(server);
  registerMatchupTool(server);
  registerMoveInfoTool(server);
  registerNatureInfoTool(server);
  registerPartyAnalysisTool(server);
  registerPartyCoverageTool(server);
  registerPartyTools(server);
  registerPokemonInfoTools(server);
  registerPokemonSummaryTool(server);
  registerSearchByAbilityTool(server);
  registerSearchByMoveTool(server);
  registerSearchByTypeEffectivenessTool(server);
  registerSelectionAnalysisTool(server);
  registerSpeedTiersTool(server);
  registerStatsCalculationTool(server);
  registerTypeInfoTool(server);

  // pokechamp 由来 (フォーク統合)
  registerFetchMetaTopTool(server);
  registerFetchPokemonMetaTool(server);
  registerFetchTypicalSetTool(server);
  registerWarmMetaCacheTool(server);
  registerCalculateDamageWithProtectionTool(server);
  registerVerifyClaimsTool(server);
  registerAnalyzePartyVsMetaTool(server);

  return server;
}

export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
