import { readFileSync } from "node:fs";
import { z } from "zod";
import type { ZodType } from "zod";
import { buildAdapter } from "./register-all.js";
import type { CliMcpAdapter, RegisteredTool } from "./adapter.js";

/**
 * 短縮サブコマンド名 → 正式 MCP ツール名のエイリアス。
 * `champs describe ガブリアス` のような短縮形を許容する。
 */
const ALIASES: Record<string, string> = {
  describe: "get_pokemon_summary",
  info: "get_pokemon_info",
  move: "get_move_info",
  ability: "get_ability_info",
  item: "get_item_info",
  nature: "get_nature_info",
  type: "get_type_info",
  condition: "get_condition_info",
  learnset: "get_learnset",
  calc: "calculate_damage_single",
  "calc-all": "calculate_damage_all_moves",
  matchup: "analyze_matchup",
  speed: "calculate_speed_tiers",
  realstat: "calculate_stats",
  // 新規 7 個 (Phase 3 で追加予定の正式名のエイリアス)
  top: "fetch_meta_top",
  meta: "fetch_pokemon_meta",
  typical: "fetch_typical_set",
  warm: "warm_meta_cache",
  verify: "verify_claims",
  analyze: "analyze_party_vs_meta",
  "calc-protect": "calculate_damage_with_protection",
};

function resolveToolName(adapter: CliMcpAdapter, name: string): RegisteredTool | undefined {
  const direct = adapter.get(name);
  if (direct) return direct;
  const aliased = ALIASES[name];
  if (aliased) return adapter.get(aliased);
  return undefined;
}

/**
 * --key value / --flag / 単一 JSON / .json ファイルパス を args オブジェクトに変換。
 * `champs <tool> '{"name":"ガブリアス"}'`
 * `champs <tool> ./team.json`
 * `champs <tool> --name ガブリアス --level 50 --no-mega`
 * `champs <tool>` (空 args)
 */
function parseArgs(rest: string[], schema: Record<string, ZodType>): Record<string, unknown> {
  if (rest.length === 0) return {};

  // 単一 JSON
  if (rest.length === 1) {
    const arg = rest[0]!;
    const trimmed = arg.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return JSON.parse(arg) as Record<string, unknown>;
    }
    if (/\.json$/i.test(arg)) {
      return JSON.parse(readFileSync(arg, "utf-8")) as Record<string, unknown>;
    }
  }

  // --key value 形式
  const out: Record<string, unknown> = {};
  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i]!;
    if (!tok.startsWith("--")) {
      throw new Error(`unexpected positional argument: ${tok}`);
    }
    const key = tok.slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith("--")) {
      // --flag (no value)
      out[key] = true;
      continue;
    }
    out[key] = coerceValue(next, schema[key]);
    i++;
  }
  return out;
}

/** 文字列値をスキーマに合わせて軽くキャスト。型は雑でいい。 */
function coerceValue(value: string, schema: ZodType | undefined): unknown {
  // スキーマが既知ならそれに沿わせる
  const def = schema?._def as { typeName?: string } | undefined;
  const typeName = def?.typeName;
  if (typeName === "ZodNumber") {
    const n = Number(value);
    return Number.isNaN(n) ? value : n;
  }
  if (typeName === "ZodBoolean") {
    return value === "true";
  }
  if (typeName === "ZodArray") {
    return value.split(",").map((s) => s.trim());
  }
  // フォールバック: JSON として読めるなら JSON、ダメなら文字列
  try {
    const parsed = JSON.parse(value);
    return parsed;
  } catch {
    return value;
  }
}

function printHelp(adapter: CliMcpAdapter): void {
  process.stderr.write(
    [
      "champs — Pokemon Champions battle assistant CLI",
      "",
      "Usage:",
      "  champs <tool> [args]",
      "  champs --list",
      "  champs --help [tool]",
      "  champs --mcp-server",
      "",
      "Args formats:",
      "  champs <tool> '{\"key\":\"value\"}'    # JSON inline",
      "  champs <tool> ./args.json              # JSON file",
      "  champs <tool> --key value --flag       # named flags",
      "",
      "List tools:",
      "  champs --list",
      "",
    ].join("\n"),
  );
}

function printList(adapter: CliMcpAdapter): void {
  for (const tool of adapter.list()) {
    process.stdout.write(`${tool.name}\n  ${tool.description}\n\n`);
  }
}

function printToolHelp(adapter: CliMcpAdapter, name: string): void {
  const tool = resolveToolName(adapter, name);
  if (!tool) {
    process.stderr.write(`unknown tool: ${name}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${tool.name}\n${tool.description}\n\n`);
  process.stdout.write("input keys:\n");
  for (const [key, type] of Object.entries(tool.rawSchema)) {
    const def = type._def as { typeName?: string; description?: string };
    const typeName = def.typeName ?? "unknown";
    const desc = def.description ?? "";
    process.stdout.write(`  --${key}  (${typeName})  ${desc}\n`);
  }
}

export async function runCli(argv: string[]): Promise<number> {
  const adapter = buildAdapter();
  const [cmd, ...rest] = argv;

  if (!cmd || cmd === "--help" || cmd === "-h") {
    if (rest[0]) {
      printToolHelp(adapter, rest[0]);
    } else {
      printHelp(adapter);
    }
    return 0;
  }
  if (cmd === "--list") {
    printList(adapter);
    return 0;
  }

  const tool = resolveToolName(adapter, cmd);
  if (!tool) {
    process.stderr.write(`unknown tool: ${cmd}\nrun 'champs --list' to see available tools\n`);
    return 1;
  }

  let args: Record<string, unknown>;
  try {
    args = parseArgs(rest, tool.rawSchema);
  } catch (err) {
    process.stderr.write(`failed to parse args: ${(err as Error).message}\n`);
    return 1;
  }

  try {
    const result = await tool.invoke(args);
    // hint (末尾の content) は CLI 出力では捨てる (LLM 用ノイズ)
    const text = result.content[0]?.text ?? "";
    process.stdout.write(text);
    if (!text.endsWith("\n")) process.stdout.write("\n");
    return result.isError ? 1 : 0;
  } catch (err) {
    if (err instanceof z.ZodError) {
      process.stderr.write(`invalid args:\n${JSON.stringify(err.issues, null, 2)}\n`);
      return 1;
    }
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return 1;
  }
}
