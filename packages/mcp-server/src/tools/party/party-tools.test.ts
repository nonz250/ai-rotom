import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { ZodType } from "zod";
import { CURRENT_PARTY_SCHEMA_VERSION } from "@ai-rotom/shared";
import type { PartiesFile } from "@ai-rotom/shared";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PartyStoreIO } from "./party-tools.js";
import { registerPartyTools } from "./party-tools.js";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

/**
 * registerPartyTools が server.tool(name, desc, schema, handler) で登録する
 * ハンドラをキャプチャする最小 McpServer モック。
 * 本家 MCP SDK は schema (z.object(inputSchema)) で事前検証してから
 * handler を呼ぶため、ここでも同じ前処理を行う。
 */
function createFakeServer(): {
  server: McpServer;
  handlers: Map<string, ToolHandler>;
} {
  const handlers = new Map<string, ToolHandler>();
  const fake = {
    tool(
      name: string,
      _description: string,
      schema: Record<string, ZodType>,
      handler: ToolHandler,
    ): void {
      const validator = z.object(schema);
      handlers.set(name, async (args) => {
        const parsed = validator.parse(args) as Record<string, unknown>;
        return handler(parsed);
      });
    },
  };
  return { server: fake as unknown as McpServer, handlers };
}

function createInMemoryStore(initial?: PartiesFile): {
  io: PartyStoreIO;
  current: () => PartiesFile;
} {
  let file: PartiesFile = initial ?? {
    schemaVersion: CURRENT_PARTY_SCHEMA_VERSION,
    parties: [],
  };
  return {
    io: {
      load: () => JSON.parse(JSON.stringify(file)) as PartiesFile,
      save: (data) => {
        file = JSON.parse(JSON.stringify(data)) as PartiesFile;
      },
    },
    current: () => file,
  };
}

function parseResult(result: {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}): { data: Record<string, unknown>; isError: boolean } {
  const text = result.content[0]!.text;
  return {
    data: JSON.parse(text) as Record<string, unknown>,
    isError: result.isError ?? false,
  };
}

describe("party CRUD tools", () => {
  let handlers: Map<string, ToolHandler>;
  let store: ReturnType<typeof createInMemoryStore>;
  const NOW_1 = new Date("2026-04-23T00:00:00.000Z");
  const NOW_2 = new Date("2026-04-23T12:00:00.000Z");

  beforeEach(() => {
    const fake = createFakeServer();
    handlers = fake.handlers;
    store = createInMemoryStore();
    let ticks = 0;
    registerPartyTools(fake.server, {
      storeIO: store.io,
      now: () => {
        const current = ticks === 0 ? NOW_1 : NOW_2;
        ticks += 1;
        return current;
      },
    });
  });

  it("4 つのツールを登録する", () => {
    expect(handlers.has("save_party")).toBe(true);
    expect(handlers.has("load_party")).toBe(true);
    expect(handlers.has("list_parties")).toBe(true);
    expect(handlers.has("delete_party")).toBe(true);
  });

  describe("save_party", () => {
    it("新規パーティを保存する (createdAt/updatedAt が now)", async () => {
      const result = await handlers.get("save_party")!({
        name: "メインパ",
        memo: "対面構築",
        members: [{ name: "Garchomp" }],
      });
      const { data, isError } = parseResult(result);
      expect(isError).toBe(false);
      expect(data.saved).toBe(true);
      expect(data.overwrote).toBe(false);
      const party = data.party as {
        name: string;
        memo?: string;
        members: unknown[];
        createdAt: string;
        updatedAt: string;
      };
      expect(party.name).toBe("メインパ");
      expect(party.memo).toBe("対面構築");
      expect(party.members).toHaveLength(1);
      expect(party.createdAt).toBe(NOW_1.toISOString());
      expect(party.updatedAt).toBe(NOW_1.toISOString());

      expect(store.current().parties).toHaveLength(1);
    });

    it("同名は上書きされ、createdAt は保持され updatedAt のみ更新される", async () => {
      await handlers.get("save_party")!({
        name: "メインパ",
        members: [{ name: "Garchomp" }],
      });
      const result = await handlers.get("save_party")!({
        name: "メインパ",
        members: [{ name: "Dragonite" }, { name: "Garchomp" }],
      });
      const { data, isError } = parseResult(result);
      expect(isError).toBe(false);
      expect(data.overwrote).toBe(true);
      const party = data.party as {
        members: unknown[];
        createdAt: string;
        updatedAt: string;
      };
      expect(party.createdAt).toBe(NOW_1.toISOString());
      expect(party.updatedAt).toBe(NOW_2.toISOString());
      expect(party.members).toHaveLength(2);
      expect(store.current().parties).toHaveLength(1);
    });

    it("1 匹未満ならバリデーションエラー", async () => {
      await expect(
        handlers.get("save_party")!({
          name: "empty",
          members: [],
        }),
      ).rejects.toThrow();
    });

    it("7 匹以上ならバリデーションエラー", async () => {
      const tooMany = Array.from({ length: 7 }, () => ({ name: "Pikachu" }));
      await expect(
        handlers.get("save_party")!({
          name: "too-many",
          members: tooMany,
        }),
      ).rejects.toThrow();
    });

    it("技 5 個はバリデーションエラー", async () => {
      await expect(
        handlers.get("save_party")!({
          name: "too-many-moves",
          members: [
            {
              name: "Pikachu",
              moves: ["a", "b", "c", "d", "e"],
            },
          ],
        }),
      ).rejects.toThrow();
    });
  });

  describe("load_party", () => {
    it("保存済みパーティを取得できる", async () => {
      await handlers.get("save_party")!({
        name: "メインパ",
        memo: "テスト",
        members: [{ name: "Garchomp" }],
      });
      const result = await handlers.get("load_party")!({ name: "メインパ" });
      const { data, isError } = parseResult(result);
      expect(isError).toBe(false);
      const party = data.party as { name: string; memo?: string };
      expect(party.name).toBe("メインパ");
      expect(party.memo).toBe("テスト");
    });

    it("存在しない name ならエラー応答", async () => {
      const result = await handlers.get("load_party")!({ name: "無い" });
      const { data, isError } = parseResult(result);
      expect(isError).toBe(true);
      expect(String(data.error)).toContain("見つかりません");
    });
  });

  describe("list_parties", () => {
    it("サマリのみを返す (members 詳細を含まない)", async () => {
      await handlers.get("save_party")!({
        name: "p1",
        memo: "m1",
        members: [{ name: "Garchomp" }, { name: "Dragonite" }],
      });
      await handlers.get("save_party")!({
        name: "p2",
        members: [{ name: "Pikachu" }],
      });

      const result = await handlers.get("list_parties")!({});
      const { data, isError } = parseResult(result);
      expect(isError).toBe(false);
      const parties = data.parties as {
        name: string;
        memo?: string;
        updatedAt: string;
        memberCount: number;
      }[];
      expect(parties).toHaveLength(2);

      const p1 = parties.find((p) => p.name === "p1")!;
      expect(p1.memo).toBe("m1");
      expect(p1.memberCount).toBe(2);
      expect(p1).not.toHaveProperty("members");

      const p2 = parties.find((p) => p.name === "p2")!;
      expect(p2.memberCount).toBe(1);
      expect(p2.memo).toBeUndefined();
    });

    it("0 件でもエラーにならず空配列を返す", async () => {
      const result = await handlers.get("list_parties")!({});
      const { data, isError } = parseResult(result);
      expect(isError).toBe(false);
      expect(data.parties).toEqual([]);
    });
  });

  describe("delete_party", () => {
    it("指定 name のパーティを削除する", async () => {
      await handlers.get("save_party")!({
        name: "a",
        members: [{ name: "Pikachu" }],
      });
      await handlers.get("save_party")!({
        name: "b",
        members: [{ name: "Garchomp" }],
      });

      const result = await handlers.get("delete_party")!({ name: "a" });
      const { data, isError } = parseResult(result);
      expect(isError).toBe(false);
      expect(data.deleted).toBe(true);

      expect(store.current().parties).toHaveLength(1);
      expect(store.current().parties[0]!.name).toBe("b");
    });

    it("存在しない name ならエラー応答", async () => {
      const result = await handlers.get("delete_party")!({ name: "無い" });
      const { data, isError } = parseResult(result);
      expect(isError).toBe(true);
      expect(String(data.error)).toContain("見つかりません");
    });
  });

  it("save → load / list / update / delete のフル CRUD ラウンドトリップ", async () => {
    await handlers.get("save_party")!({
      name: "メインパ",
      memo: "初版",
      members: [{ name: "Garchomp" }],
    });
    const loaded1 = parseResult(
      await handlers.get("load_party")!({ name: "メインパ" }),
    );
    expect((loaded1.data.party as { memo: string }).memo).toBe("初版");

    const list1 = parseResult(await handlers.get("list_parties")!({}));
    expect((list1.data.parties as unknown[]).length).toBe(1);

    // update (同名上書き)
    await handlers.get("save_party")!({
      name: "メインパ",
      memo: "第二版",
      members: [{ name: "Dragonite" }, { name: "Garchomp" }],
    });
    const loaded2 = parseResult(
      await handlers.get("load_party")!({ name: "メインパ" }),
    );
    const party2 = loaded2.data.party as {
      memo: string;
      members: unknown[];
    };
    expect(party2.memo).toBe("第二版");
    expect(party2.members).toHaveLength(2);

    // delete
    const del = parseResult(
      await handlers.get("delete_party")!({ name: "メインパ" }),
    );
    expect(del.isError).toBe(false);

    const list2 = parseResult(await handlers.get("list_parties")!({}));
    expect((list2.data.parties as unknown[]).length).toBe(0);
  });
});
