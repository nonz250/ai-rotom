import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  MAX_MOVES_PER_MEMBER,
  MAX_NAME_LENGTH,
  MAX_PARTY_MEMBERS,
  MAX_PARTY_NAME_LENGTH,
} from "@ai-rotom/shared";
import { createCoreServer } from "./core-server";
import { CORE_INSTRUCTIONS } from "./instructions";

const INPUT_VALIDATION_ERROR = "Input validation error";

const NAME_AT_LIMIT = "あ".repeat(MAX_NAME_LENGTH);
const NAME_OVER_LIMIT = "あ".repeat(MAX_NAME_LENGTH + 1);
const LABEL_AT_LIMIT = "あ".repeat(MAX_PARTY_NAME_LENGTH);
const LABEL_OVER_LIMIT = "あ".repeat(MAX_PARTY_NAME_LENGTH + 1);

interface ToolCallOutcome {
  isError: boolean;
  text: string;
}

let client: Client;

beforeAll(async () => {
  const server = createCoreServer(CORE_INSTRUCTIONS);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterAll(async () => {
  await client.close();
});

async function callTool(name: string, args: Record<string, unknown>): Promise<ToolCallOutcome> {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as { type: string; text: string }[];
  return { isError: result.isError === true, text: content[0]?.text ?? "" };
}

const ATTACKER = { name: "ガブリアス" };
const DEFENDER = { name: "サーフゴー" };

const NAME_ARGUMENTS: [string, string, Record<string, unknown>][] = [
  ["get_pokemon_info", "name", {}],
  ["get_pokemon_summary", "name", {}],
  ["get_move_info", "name", {}],
  ["get_ability_info", "name", {}],
  ["get_item_info", "name", {}],
  ["get_nature_info", "name", {}],
  ["get_type_info", "type", {}],
  ["get_condition_info", "name", {}],
  ["get_learnset", "name", {}],
  ["search_pokemon", "type", {}],
  ["search_pokemon_by_move", "moveName", {}],
  ["search_pokemon_by_ability", "abilityName", {}],
  ["search_pokemon_by_type_effectiveness", "resistsType", {}],
  ["search_pokemon_by_type_effectiveness", "immuneToType", {}],
  ["search_pokemon_by_type_effectiveness", "weakToType", {}],
  ["search_pokemon_by_type_effectiveness", "hasAttackingType", {}],
  ["calculate_stats", "name", {}],
  ["calculate_stats", "nature", { name: "ガブリアス" }],
  ["list_speed_tiers", "around", {}],
  ["calculate_damage_single", "moveName", { attacker: ATTACKER, defender: DEFENDER }],
  ["analyze_damage_range", "moveName", { attacker: ATTACKER, defender: DEFENDER }],
];

describe("createCoreServer の名前の入力", () => {
  it.each(NAME_ARGUMENTS)("%s の %s は最大文字数まで入力検証を通る", async (tool, field, rest) => {
    const outcome = await callTool(tool, { ...rest, [field]: NAME_AT_LIMIT });
    expect(outcome.text).not.toContain(INPUT_VALIDATION_ERROR);
  });

  it.each(NAME_ARGUMENTS)("%s の %s は最大文字数を超えると入力検証で拒否する", async (tool, field, rest) => {
    const outcome = await callTool(tool, { ...rest, [field]: NAME_OVER_LIMIT });
    expect(outcome.isError).toBe(true);
    expect(outcome.text).toContain(INPUT_VALIDATION_ERROR);
  });
});

describe("compare_parties の labels", () => {
  const parties = { partyA: [ATTACKER], partyB: [DEFENDER] };

  it.each(["partyA", "partyB"])("%s はパーティ名の最大文字数まで受け付ける", async (label) => {
    const outcome = await callTool("compare_parties", { ...parties, labels: { [label]: LABEL_AT_LIMIT } });
    expect(outcome.isError).toBe(false);
  });

  it.each(["partyA", "partyB"])("%s はパーティ名の最大文字数を超えると入力検証で拒否する", async (label) => {
    const outcome = await callTool("compare_parties", { ...parties, labels: { [label]: LABEL_OVER_LIMIT } });
    expect(outcome.isError).toBe(true);
    expect(outcome.text).toContain(INPUT_VALIDATION_ERROR);
  });
});

const ATTACKER_WITH_MOVES = { name: "ガブリアス", moves: ["じしん", "げきりん", "ストーンエッジ", "つるぎのまい"] };

function party(member: Record<string, unknown>, size: number): Record<string, unknown>[] {
  return Array.from({ length: size }, () => member);
}

const PARTY_ARGUMENTS: [string, string, Record<string, unknown>, Record<string, unknown>][] = [
  ["calculate_damage_party_matchup", "myParty", ATTACKER_WITH_MOVES, { opponentParty: [DEFENDER] }],
  ["calculate_damage_party_matchup", "opponentParty", DEFENDER, { myParty: [ATTACKER_WITH_MOVES] }],
  ["analyze_selection", "myParty", ATTACKER_WITH_MOVES, { opponentParty: [DEFENDER], battleFormat: "singles" }],
  [
    "analyze_selection",
    "opponentParty",
    DEFENDER,
    { myParty: [ATTACKER_WITH_MOVES], battleFormat: "singles" },
  ],
  ["analyze_party_weakness", "party", ATTACKER, {}],
  ["analyze_party_coverage", "myParty", ATTACKER, {}],
  ["compare_parties", "partyA", ATTACKER, { partyB: [DEFENDER] }],
  ["compare_parties", "partyB", DEFENDER, { partyA: [ATTACKER] }],
];

describe("createCoreServer のパーティの人数", () => {
  it.each(PARTY_ARGUMENTS)("%s の %s は 6 匹まで受け付ける", async (tool, field, member, rest) => {
    const outcome = await callTool(tool, { ...rest, [field]: party(member, MAX_PARTY_MEMBERS) });
    expect(outcome.isError).toBe(false);
  });

  it.each(PARTY_ARGUMENTS)("%s の %s は 7 匹以上を入力検証で拒否する", async (tool, field, member, rest) => {
    const outcome = await callTool(tool, { ...rest, [field]: party(member, MAX_PARTY_MEMBERS + 1) });
    expect(outcome.isError).toBe(true);
    expect(outcome.text).toContain(INPUT_VALIDATION_ERROR);
  });

  it.each(PARTY_ARGUMENTS)("%s の %s は空のパーティを入力検証で拒否する", async (tool, field, _member, rest) => {
    const outcome = await callTool(tool, { ...rest, [field]: [] });
    expect(outcome.isError).toBe(true);
    expect(outcome.text).toContain(INPUT_VALIDATION_ERROR);
  });
});

const MOVE_NAMES = ["じしん", "げきりん", "ストーンエッジ", "つるぎのまい", "ほのおのキバ"];

function movesForPokemonCount(count: number): Record<string, string[]> {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => [`ポケモン${index}`, ["じしん"]]));
}

const MOVES_MAP_ARGUMENTS: [string, Record<string, unknown>][] = [
  ["analyze_selection", { myParty: [ATTACKER], opponentParty: [DEFENDER], battleFormat: "singles" }],
  ["analyze_party_coverage", { myParty: [ATTACKER] }],
];

describe("createCoreServer のポケモンごとの技指定", () => {
  it.each(MOVES_MAP_ARGUMENTS)("%s は 1 匹あたり 4 個までの技を受け付ける", async (tool, rest) => {
    const moves = { ガブリアス: MOVE_NAMES.slice(0, MAX_MOVES_PER_MEMBER) };
    const outcome = await callTool(tool, { ...rest, moves });
    expect(outcome.isError).toBe(false);
  });

  it.each(MOVES_MAP_ARGUMENTS)("%s は技構成を必須にしない設定でも 5 個以上の技を入力検証で拒否する", async (tool, rest) => {
    const moves = { ガブリアス: MOVE_NAMES.slice(0, MAX_MOVES_PER_MEMBER + 1) };
    const outcome = await callTool(tool, { ...rest, moves });
    expect(outcome.isError).toBe(true);
    expect(outcome.text).toContain(INPUT_VALIDATION_ERROR);
  });

  it.each(MOVES_MAP_ARGUMENTS)("%s は 6 匹分までの技指定を入力検証で通す", async (tool, rest) => {
    const outcome = await callTool(tool, { ...rest, moves: movesForPokemonCount(MAX_PARTY_MEMBERS) });
    expect(outcome.text).not.toContain(INPUT_VALIDATION_ERROR);
  });

  it.each(MOVES_MAP_ARGUMENTS)("%s は 7 匹分以上の技指定を入力検証で拒否する", async (tool, rest) => {
    const outcome = await callTool(tool, { ...rest, moves: movesForPokemonCount(MAX_PARTY_MEMBERS + 1) });
    expect(outcome.isError).toBe(true);
    expect(outcome.text).toContain(INPUT_VALIDATION_ERROR);
  });

  it.each(MOVES_MAP_ARGUMENTS)("%s は最大文字数を超えるポケモン名のキーを入力検証で拒否する", async (tool, rest) => {
    const outcome = await callTool(tool, { ...rest, moves: { [NAME_OVER_LIMIT]: ["じしん"] } });
    expect(outcome.isError).toBe(true);
    expect(outcome.text).toContain(INPUT_VALIDATION_ERROR);
  });

  it.each(MOVES_MAP_ARGUMENTS)("%s は最大文字数を超える技名を入力検証で拒否する", async (tool, rest) => {
    const outcome = await callTool(tool, { ...rest, moves: { ガブリアス: [NAME_OVER_LIMIT] } });
    expect(outcome.isError).toBe(true);
    expect(outcome.text).toContain(INPUT_VALIDATION_ERROR);
  });
});
