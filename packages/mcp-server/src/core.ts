/**
 * 他のワークスペースから mcp-server を組み込むときの入口。
 * ここに出していないモジュールは mcp-server の内部実装なので、直接 import しない。
 */
export { createCoreServer } from "./core-server.js";
export { CORE_INSTRUCTIONS, PARTY_STORAGE_INSTRUCTIONS } from "./instructions.js";
export type { MovesRequirement } from "./moves-requirement.js";
