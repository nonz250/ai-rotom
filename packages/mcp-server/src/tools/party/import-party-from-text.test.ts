import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { ZodType } from "zod";
import { CURRENT_PARTY_SCHEMA_VERSION } from "@ai-rotom/shared";
import type { PartiesFile } from "@ai-rotom/shared";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PartyStoreIO } from "./import-party-from-text.js";
import {
  registerImportPartyFromTextTool,
  runImportPartyFromText,
} from "./import-party-from-text.js";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

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

function parseResult(result: ToolResult): {
  data: Record<string, unknown>;
  isError: boolean;
} {
  const text = result.content[0]!.text;
  return {
    data: JSON.parse(text) as Record<string, unknown>,
    isError: result.isError ?? false,
  };
}

const BLOCK_GARCHOMP = `ガブリアス @ こだわりスカーフ
特性: さめはだ
能力補正: いじっぱり
170(2)-200(32)-115-90-100-167(32)
じしん / ドラゴンクロー / つのドリル / いわなだれ`;

const BLOCK_GYARADOS = `ギャラドス @ ギャラドスナイト
特性: いかく
能力補正: ようき`;

describe("import_party_from_text tool", () => {
  let handlers: Map<string, ToolHandler>;
  let store: ReturnType<typeof createInMemoryStore>;
  const NOW = new Date("2026-04-23T10:00:00.000Z");

  beforeEach(() => {
    const fake = createFakeServer();
    handlers = fake.handlers;
    store = createInMemoryStore();
    registerImportPartyFromTextTool(fake.server, {
      storeIO: store.io,
      now: () => NOW,
    });
  });

  it("ツールを登録する", () => {
    expect(handlers.has("import_party_from_text")).toBe(true);
  });

  it("1 匹のポケソルテキストから保存する", async () => {
    const result = await handlers.get("import_party_from_text")!({
      text: BLOCK_GARCHOMP,
      name: "メインパ",
    });
    const { data, isError } = parseResult(result);
    expect(isError).toBe(false);
    expect(data.saved).toBe(true);
    expect(data.overwrote).toBe(false);
    const party = data.party as {
      name: string;
      members: {
        name: string;
        item?: string;
        ability?: string;
        nature?: string;
        evs?: Record<string, number>;
        moves?: string[];
      }[];
      createdAt: string;
      updatedAt: string;
    };
    expect(party.name).toBe("メインパ");
    expect(party.members).toHaveLength(1);
    expect(party.members[0]!.name).toBe("ガブリアス");
    expect(party.members[0]!.item).toBe("こだわりスカーフ");
    expect(party.members[0]!.ability).toBe("さめはだ");
    expect(party.members[0]!.nature).toBe("いじっぱり");
    expect(party.members[0]!.evs).toEqual({
      hp: 2,
      atk: 32,
      def: 0,
      spa: 0,
      spd: 0,
      spe: 32,
    });
    expect(party.members[0]!.moves).toEqual([
      "じしん",
      "ドラゴンクロー",
      "つのドリル",
      "いわなだれ",
    ]);
    expect(party.createdAt).toBe(NOW.toISOString());
    expect(store.current().parties).toHaveLength(1);
  });

  it("空行区切りで 2 匹以上を保存する", async () => {
    const text = `${BLOCK_GARCHOMP}\n\n${BLOCK_GYARADOS}`;
    const result = await handlers.get("import_party_from_text")!({
      text,
      name: "混合パ",
    });
    const { data, isError } = parseResult(result);
    expect(isError).toBe(false);
    const party = data.party as { members: { name: string }[] };
    expect(party.members.map((m) => m.name)).toEqual([
      "ガブリアス",
      "ギャラドス",
    ]);
  });

  it("メガシンカ記法は preMega 特性を ability に保存し warning を返す", async () => {
    const text = `バンギラス @ バンギラスナイト
特性: すなのちから(さめはだ)
能力補正: いじっぱり`;
    const result = await handlers.get("import_party_from_text")!({
      text,
      name: "メガパ",
    });
    const { data, isError } = parseResult(result);
    expect(isError).toBe(false);
    const party = data.party as { members: { ability?: string }[] };
    expect(party.members[0]!.ability).toBe("さめはだ");
    const warnings = data.warnings as string[];
    expect(warnings.some((w) => w.includes("メガ前特性"))).toBe(true);
  });

  it("性格省略はデフォルト まじめ を補完し warning を返す", async () => {
    const text = `ガブリアス
特性: さめはだ
能力補正:`;
    const result = await handlers.get("import_party_from_text")!({
      text,
      name: "省略パ",
    });
    const { data, isError } = parseResult(result);
    expect(isError).toBe(false);
    const party = data.party as { members: { nature?: string }[] };
    expect(party.members[0]!.nature).toBe("まじめ");
    const warnings = data.warnings as string[];
    expect(warnings.some((w) => w.includes("まじめ"))).toBe(true);
  });

  it("@ 省略 (持ち物なし) は item を設定しない", async () => {
    const text = `ガブリアス
特性: さめはだ
能力補正: いじっぱり`;
    const result = await handlers.get("import_party_from_text")!({
      text,
      name: "無装備パ",
    });
    const { data, isError } = parseResult(result);
    expect(isError).toBe(false);
    const party = data.party as { members: { item?: string }[] };
    expect(party.members[0]!.item).toBeUndefined();
  });

  it("SP 合計超過はエラー応答 (partySchema 経由)", async () => {
    // 各ステ 32、合計 32*3 = 96 > 66 なのでエラー。
    const text = `ガブリアス
特性: さめはだ
能力補正: いじっぱり
170(32)-200(32)-115(32)-90-100-167`;
    const result = await handlers.get("import_party_from_text")!({
      text,
      name: "sp超過パ",
    });
    const { data, isError } = parseResult(result);
    expect(isError).toBe(true);
    expect(String(data.error)).toContain("能力ポイント");
  });

  it("メンバー 7 匹はエラー応答", async () => {
    const block = `ガブリアス
特性: さめはだ
能力補正: いじっぱり`;
    const text = Array.from({ length: 7 }, () => block).join("\n\n");
    const result = await handlers.get("import_party_from_text")!({
      text,
      name: "超過パ",
    });
    const { data, isError } = parseResult(result);
    expect(isError).toBe(true);
    expect(String(data.error)).toContain("6 匹");
  });

  it("メンバー 0 匹はエラー応答 (空文字は schema で弾かれる)", async () => {
    await expect(
      handlers.get("import_party_from_text")!({
        text: "",
        name: "空パ",
      }),
    ).rejects.toThrow();
  });

  it("未知のポケモン名は類似候補付きエラー応答", async () => {
    const text = `ソニックザヘッジホッグ
特性: さめはだ
能力補正: いじっぱり`;
    const result = await handlers.get("import_party_from_text")!({
      text,
      name: "未知パ",
    });
    const { data, isError } = parseResult(result);
    expect(isError).toBe(true);
    expect(String(data.error)).toContain("ポケモン名");
    expect(String(data.error)).toContain("見つかりません");
  });

  it("パーサーが throw するケース (不正 syntax) はブロック番号付きエラー応答", async () => {
    const text = `これは完全に\n壊れた入力`;
    const result = await handlers.get("import_party_from_text")!({
      text,
      name: "壊れ入力パ",
    });
    const { data, isError } = parseResult(result);
    expect(isError).toBe(true);
    expect(String(data.error)).toMatch(/ブロック 1/);
  });

  it("同名パーティは upsert される (createdAt 保持、updatedAt 更新)", async () => {
    const text1 = BLOCK_GARCHOMP;
    const NOW_2 = new Date("2026-04-24T00:00:00.000Z");

    // まず初回保存。
    const first = parseResult(
      await handlers.get("import_party_from_text")!({
        text: text1,
        name: "メインパ",
      }),
    );
    expect(first.isError).toBe(false);
    expect((first.data.party as { createdAt: string }).createdAt).toBe(
      NOW.toISOString(),
    );

    // now を差し替えて上書き保存。
    const fake2 = createFakeServer();
    registerImportPartyFromTextTool(fake2.server, {
      storeIO: store.io,
      now: () => NOW_2,
    });
    const second = parseResult(
      await fake2.handlers.get("import_party_from_text")!({
        text: `${text1}\n\n${BLOCK_GYARADOS}`,
        name: "メインパ",
      }),
    );
    expect(second.isError).toBe(false);
    const updated = second.data.party as {
      members: unknown[];
      createdAt: string;
      updatedAt: string;
    };
    expect(updated.createdAt).toBe(NOW.toISOString());
    expect(updated.updatedAt).toBe(NOW_2.toISOString());
    expect(updated.members).toHaveLength(2);
    expect(second.data.overwrote).toBe(true);
  });
});

describe("runImportPartyFromText", () => {
  const NOW = new Date("2026-04-23T10:00:00.000Z");

  it("メモを渡した場合は party.memo に保存される", () => {
    const store = createInMemoryStore();
    const result = runImportPartyFromText(
      {
        text: BLOCK_GARCHOMP,
        name: "メインパ",
        memo: "対面構築、ガブが起点作り",
      },
      { storeIO: store.io, now: () => NOW },
    );
    expect(result.party.memo).toBe("対面構築、ガブが起点作り");
    expect(store.current().parties[0]!.memo).toBe("対面構築、ガブが起点作り");
  });
});
