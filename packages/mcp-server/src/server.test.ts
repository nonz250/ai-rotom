import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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

async function listToolNames(server: McpServer): Promise<string[]> {
  const client = await connect(server);
  const { tools } = await client.listTools();
  await client.close();
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

  it("渡した instructions をクライアントに返す", async () => {
    const client = await connect(createCoreServer(CORE_INSTRUCTIONS));
    expect(client.getInstructions()).toBe(CORE_INSTRUCTIONS);
    await client.close();
  });
});

describe("createServer", () => {
  it("共通のツールに加えてパーティ保存系のツールを登録する", async () => {
    const coreNames = await listToolNames(createCoreServer(CORE_INSTRUCTIONS));
    const names = await listToolNames(createServer());

    expect([...names].sort()).toEqual([...coreNames, ...PARTY_STORAGE_TOOLS].sort());
  });

  it("パーティ保存の使い方を含む instructions を返す", async () => {
    const client = await connect(createServer());
    expect(client.getInstructions()).toBe(SERVER_INSTRUCTIONS);
    await client.close();
  });
});
