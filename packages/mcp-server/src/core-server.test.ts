import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MAX_NAME_LENGTH, MAX_PARTY_NAME_LENGTH } from "@ai-rotom/shared";
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
