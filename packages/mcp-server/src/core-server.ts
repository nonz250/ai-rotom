import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MOVES_OPTIONAL, type MovesRequirement } from "./moves-requirement.js";
import { registerAbilityInfoTool } from "./tools/info/ability-info.js";
import { registerComparePartiesTool } from "./tools/analysis/compare-parties.js";
import { registerConditionInfoTool } from "./tools/info/condition-info.js";
import { registerDamageCalculationTools } from "./tools/calc/damage-calculation.js";
import { registerDamageRangeTool } from "./tools/calc/damage-range.js";
import { registerItemInfoTool } from "./tools/info/item-info.js";
import { registerLearnsetTool } from "./tools/info/learnset.js";
import { registerMatchupTool } from "./tools/analysis/matchup.js";
import { registerMoveInfoTool } from "./tools/info/move-info.js";
import { registerNatureInfoTool } from "./tools/info/nature-info.js";
import { registerPartyAnalysisTool } from "./tools/analysis/party-analysis.js";
import { registerPartyCoverageTool } from "./tools/analysis/party-coverage.js";
import { registerPokemonInfoTools } from "./tools/info/pokemon-info.js";
import { registerPokemonSummaryTool } from "./tools/info/pokemon-summary.js";
import { registerSearchByAbilityTool } from "./tools/search/search-by-ability.js";
import { registerSearchByMoveTool } from "./tools/search/search-by-move.js";
import { registerSearchByTypeEffectivenessTool } from "./tools/search/search-by-type-effectiveness.js";
import { registerSelectionAnalysisTool } from "./tools/analysis/selection-analysis.js";
import { registerSpeedTiersTool } from "./tools/calc/speed-tiers.js";
import { registerStatsCalculationTool } from "./tools/calc/stats-calculation.js";
import { registerTypeInfoTool } from "./tools/info/type-info.js";

const SERVER_NAME = "ai-rotom";
const SERVER_VERSION = "0.0.1";

/**
 * 1 回のツール呼び出しで受け付ける引数の要素数 (配列の要素とオブジェクトのメンバーの合計) の上限。
 */
export const MAX_TOOL_INPUT_ELEMENTS = 1000;

/**
 * パーティ保存系を除くツールを登録した MCP サーバーを作る。
 * 保存系はファイルに書き込むので、ファイルを持たない実行環境でも読み込めるよう、ここから import しない。
 */
export function createCoreServer(
  instructions: string,
  movesRequirement: MovesRequirement = MOVES_OPTIONAL,
): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      instructions,
      maxToolInputElements: MAX_TOOL_INPUT_ELEMENTS,
    },
  );

  registerAbilityInfoTool(server);
  registerComparePartiesTool(server);
  registerConditionInfoTool(server);
  registerDamageCalculationTools(server, movesRequirement);
  registerDamageRangeTool(server);
  registerItemInfoTool(server);
  registerLearnsetTool(server);
  registerMatchupTool(server, movesRequirement);
  registerMoveInfoTool(server);
  registerNatureInfoTool(server);
  registerPartyAnalysisTool(server);
  registerPartyCoverageTool(server);
  registerPokemonInfoTools(server);
  registerPokemonSummaryTool(server);
  registerSearchByAbilityTool(server);
  registerSearchByMoveTool(server);
  registerSearchByTypeEffectivenessTool(server);
  registerSelectionAnalysisTool(server, movesRequirement);
  registerSpeedTiersTool(server);
  registerStatsCalculationTool(server);
  registerTypeInfoTool(server);

  return server;
}
