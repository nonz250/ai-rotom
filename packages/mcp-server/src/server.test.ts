import { afterEach, describe, it, expect, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { damageCalculator } from "./calc/damage-calculator";
import { createCoreServer } from "./core-server";
import { CORE_INSTRUCTIONS, SERVER_INSTRUCTIONS } from "./instructions";
import { createServer } from "./server";

const PARTY_STORAGE_TOOLS = [
  "save_party",
  "load_party",
  "list_parties",
  "delete_party",
  "import_party_from_text",
];

async function connect(server: McpServer): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

async function withClient<T>(server: McpServer, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = await connect(server);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

async function listToolNames(server: McpServer): Promise<string[]> {
  const { tools } = await withClient(server, (client) => client.listTools());
  return tools.map((tool) => tool.name);
}

describe("createCoreServer", () => {
  it("パーティ保存系のツールを登録しない", async () => {
    const names = await listToolNames(createCoreServer(CORE_INSTRUCTIONS));

    expect(names).toContain("calculate_damage_all_moves");
    for (const name of PARTY_STORAGE_TOOLS) {
      expect(names).not.toContain(name);
    }
  });

  it("パーティ保存系のツールを instructions で案内しない", async () => {
    const coreNames = new Set(await listToolNames(createCoreServer(CORE_INSTRUCTIONS)));
    const storageOnly = (await listToolNames(createServer())).filter((name) => !coreNames.has(name));

    expect(storageOnly).toEqual(expect.arrayContaining(PARTY_STORAGE_TOOLS));
    for (const name of storageOnly) {
      expect(CORE_INSTRUCTIONS).not.toContain(name);
    }
  });

  it("渡した instructions をクライアントに返す", async () => {
    const instructions = await withClient(createCoreServer(CORE_INSTRUCTIONS), async (client) =>
      client.getInstructions(),
    );
    expect(instructions).toBe(CORE_INSTRUCTIONS);
  });
});

describe("createServer", () => {
  it("共通のツールに加えてパーティ保存系のツールを登録する", async () => {
    const coreNames = await listToolNames(createCoreServer(CORE_INSTRUCTIONS));
    const names = await listToolNames(createServer());

    expect([...names].sort()).toEqual([...coreNames, ...PARTY_STORAGE_TOOLS].sort());
  });

  it("パーティ保存の使い方を含む instructions を返す", async () => {
    const instructions = await withClient(createServer(), async (client) => client.getInstructions());
    expect(instructions).toBe(SERVER_INSTRUCTIONS);
  });
});

describe("ツールのエラー応答", () => {
  const GENERIC_ERROR_MESSAGE = "ツールの実行中に予期しないエラーが発生しました。";
  const DAMAGE_SINGLE_ARGS = {
    attacker: { name: "ガブリアス" },
    defender: { name: "リザードン" },
    moveName: "じしん",
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function callToolError(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ isError: unknown; error: unknown }> {
    const result = await withClient(createCoreServer(CORE_INSTRUCTIONS), (client) =>
      client.callTool({ name, arguments: args }),
    );
    const [first] = result.content as { type: string; text: string }[];
    return { isError: result.isError, error: (JSON.parse(first!.text) as { error: unknown }).error };
  }

  it("存在しないポケモン名を渡すと、候補を添えた文面をそのまま返す", async () => {
    const { isError, error } = await callToolError("get_pokemon_info", { name: "リザードソ" });

    expect(isError).toBe(true);
    expect(error).toEqual(expect.stringContaining("ポケモン「リザードソ」が見つかりません。"));
    expect(error).toEqual(expect.stringContaining("もしかして"));
    expect(error).toEqual(expect.stringContaining("リザードン"));
  });

  it("ダメ計エンジン内の名前解決で見つからない技名は、文面をそのまま返す", async () => {
    const { isError, error } = await callToolError("calculate_damage_single", {
      ...DAMAGE_SINGLE_ARGS,
      moveName: "じしんじしん",
    });

    expect(isError).toBe(true);
    expect(error).toEqual(expect.stringContaining("技「じしんじしん」が見つかりません。"));
  });

  it("ダメ計エンジンが TypeError を投げても、その文面は返さず固定の文面を返す", async () => {
    vi.spyOn(damageCalculator, "calculate").mockImplementation(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'species')");
    });

    const { isError, error } = await callToolError("calculate_damage_single", DAMAGE_SINGLE_ARGS);

    expect(isError).toBe(true);
    expect(error).toBe(GENERIC_ERROR_MESSAGE);
  });

  it("ダメ計エンジンが Error 以外の値を投げても固定の文面を返す", async () => {
    vi.spyOn(damageCalculator, "calculate").mockImplementation(() => {
      throw "engine exploded";
    });

    const { isError, error } = await callToolError("calculate_damage_single", DAMAGE_SINGLE_ARGS);

    expect(isError).toBe(true);
    expect(error).toBe(GENERIC_ERROR_MESSAGE);
  });
});
