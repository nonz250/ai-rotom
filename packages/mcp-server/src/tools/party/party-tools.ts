import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  CURRENT_PARTY_SCHEMA_VERSION,
  MAX_MOVES_PER_MEMBER,
  MAX_NAME_LENGTH,
  MAX_PARTY_MEMBERS,
  MAX_PARTY_MEMO_LENGTH,
  MAX_PARTY_NAME_LENGTH,
  MIN_PARTY_MEMBERS,
  evsSchema,
} from "@ai-rotom/shared";
import type { Party, PartiesFile, PartyMember } from "@ai-rotom/shared";
import {
  loadPartiesFile,
  resolvePartiesFilePath,
  savePartiesFile,
} from "../../party-store.js";
import { TOOL_RESPONSE_HINT_CONTENT } from "../../tool-response-hint.js";

const SAVE_TOOL_NAME = "save_party";
const SAVE_TOOL_DESCRIPTION =
  "パーティを保存する (upsert)。同名のパーティが既に存在する場合は上書きされる。createdAt は新規時のみ現在時刻が記録され、同名上書きの場合は保持される。updatedAt は毎回現在時刻に更新される。";

const LOAD_TOOL_NAME = "load_party";
const LOAD_TOOL_DESCRIPTION =
  "保存済みパーティを name 指定で 1 件取得する。存在しない場合はエラーを返す。";

const LIST_TOOL_NAME = "list_parties";
const LIST_TOOL_DESCRIPTION =
  "保存済みパーティの一覧 (サマリ) を返す。各要素は { name, memo, updatedAt, memberCount } のみで、メンバー詳細は含まない。詳細は load_party を使用する。";

const DELETE_TOOL_NAME = "delete_party";
const DELETE_TOOL_DESCRIPTION =
  "保存済みパーティを name 指定で削除する。存在しない場合はエラーを返す。";

/**
 * 書き込み時刻の供給関数。テストで固定時刻を注入するために分離する。
 */
export type NowProvider = () => Date;
const defaultNowProvider: NowProvider = () => new Date();

/**
 * 永続化層の読み書き関数。テストでファイル I/O を差し替えるために分離する。
 */
export interface PartyStoreIO {
  load: () => PartiesFile;
  save: (data: PartiesFile) => void;
}

const defaultStoreIO: PartyStoreIO = {
  load: () => loadPartiesFile(),
  save: (data) => savePartiesFile(data),
};

/**
 * 登録ツール群に注入する依存関係。
 */
export interface PartyToolsDeps {
  storeIO?: PartyStoreIO;
  now?: NowProvider;
}

const nameField = z
  .string()
  .min(1, { message: "名前は 1 文字以上で指定してください。" })
  .max(MAX_NAME_LENGTH, {
    message: `名前は ${MAX_NAME_LENGTH} 文字以下で指定してください。`,
  });

const partyMemberInputSchema = z
  .object({
    name: nameField.describe("ポケモン名 (日本語 or 英語)。"),
    nature: nameField.optional().describe("性格名 (日本語 or 英語)。"),
    ability: nameField.optional().describe("特性名 (日本語 or 英語)。"),
    item: nameField.optional().describe("持ち物名 (日本語 or 英語)。"),
    evs: evsSchema.optional().describe("能力ポイント (SP) 配分。"),
    moves: z
      .array(nameField)
      .max(MAX_MOVES_PER_MEMBER, {
        message: `技は ${MAX_MOVES_PER_MEMBER} 個までです。`,
      })
      .optional()
      .describe("技リスト (最大 4)。"),
  })
  .describe("パーティメンバー 1 匹分のビルド情報。");

const partyNameField = z
  .string()
  .min(1, { message: "パーティ名は 1 文字以上で指定してください。" })
  .max(MAX_PARTY_NAME_LENGTH, {
    message: `パーティ名は ${MAX_PARTY_NAME_LENGTH} 文字以下で指定してください。`,
  });

const saveInputSchema = {
  name: partyNameField.describe("パーティの識別子 (同名は上書き)。"),
  memo: z
    .string()
    .max(MAX_PARTY_MEMO_LENGTH, {
      message: `メモは ${MAX_PARTY_MEMO_LENGTH} 文字以下で指定してください。`,
    })
    .optional()
    .describe("自由記述メモ。"),
  members: z
    .array(partyMemberInputSchema)
    .min(MIN_PARTY_MEMBERS, {
      message: `パーティには ${MIN_PARTY_MEMBERS} 匹以上を含めてください。`,
    })
    .max(MAX_PARTY_MEMBERS, {
      message: `パーティには ${MAX_PARTY_MEMBERS} 匹までしか含められません。`,
    })
    .describe("1〜6 匹のメンバー。"),
};

const loadInputSchema = {
  name: partyNameField.describe("取得するパーティ名。"),
};

const deleteInputSchema = {
  name: partyNameField.describe("削除するパーティ名。"),
};

const listInputSchema = {};

interface SaveInput {
  name: string;
  memo?: string;
  members: PartyMember[];
}

interface PartySummary {
  name: string;
  memo?: string;
  updatedAt: string;
  memberCount: number;
}

function toErrorResponse(error: unknown) {
  const message =
    error instanceof Error ? error.message : "不明なエラーが発生しました";
  return {
    content: [
      { type: "text" as const, text: JSON.stringify({ error: message }) },
    ],
    isError: true,
  };
}

function toTextResponse(value: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(value) },
      TOOL_RESPONSE_HINT_CONTENT,
    ],
  };
}

function toSummary(party: Party): PartySummary {
  const summary: PartySummary = {
    name: party.name,
    updatedAt: party.updatedAt,
    memberCount: party.members.length,
  };
  if (party.memo !== undefined) {
    summary.memo = party.memo;
  }
  return summary;
}

/**
 * パーティ永続化 4 ツールをサーバーに登録する。
 * deps は主にテスト用。本番は省略してデフォルト (ファイル I/O + 現在時刻) を使う。
 */
export function registerPartyTools(
  server: McpServer,
  deps: PartyToolsDeps = {},
): void {
  const storeIO = deps.storeIO ?? defaultStoreIO;
  const now = deps.now ?? defaultNowProvider;

  server.tool(
    SAVE_TOOL_NAME,
    SAVE_TOOL_DESCRIPTION,
    saveInputSchema,
    async (args: SaveInput) => {
      try {
        const file = storeIO.load();
        const nowIso = now().toISOString();
        const existingIndex = file.parties.findIndex(
          (p) => p.name === args.name,
        );
        const createdAt =
          existingIndex >= 0
            ? file.parties[existingIndex]!.createdAt
            : nowIso;

        const party: Party = {
          name: args.name,
          members: args.members,
          createdAt,
          updatedAt: nowIso,
        };
        if (args.memo !== undefined) {
          party.memo = args.memo;
        }

        if (existingIndex >= 0) {
          file.parties[existingIndex] = party;
        } else {
          file.parties.push(party);
        }

        storeIO.save({
          schemaVersion: CURRENT_PARTY_SCHEMA_VERSION,
          parties: file.parties,
        });

        return toTextResponse({
          saved: true,
          overwrote: existingIndex >= 0,
          party,
          filePath: resolvePartiesFilePath(),
        });
      } catch (error: unknown) {
        return toErrorResponse(error);
      }
    },
  );

  server.tool(
    LOAD_TOOL_NAME,
    LOAD_TOOL_DESCRIPTION,
    loadInputSchema,
    async (args: { name: string }) => {
      try {
        const file = storeIO.load();
        const party = file.parties.find((p) => p.name === args.name);
        if (party === undefined) {
          throw new Error(
            `パーティ「${args.name}」が見つかりません。list_parties で一覧を確認してください。`,
          );
        }
        return toTextResponse({ party });
      } catch (error: unknown) {
        return toErrorResponse(error);
      }
    },
  );

  server.tool(
    LIST_TOOL_NAME,
    LIST_TOOL_DESCRIPTION,
    listInputSchema,
    async () => {
      try {
        const file = storeIO.load();
        const parties = file.parties.map(toSummary);
        return toTextResponse({ parties });
      } catch (error: unknown) {
        return toErrorResponse(error);
      }
    },
  );

  server.tool(
    DELETE_TOOL_NAME,
    DELETE_TOOL_DESCRIPTION,
    deleteInputSchema,
    async (args: { name: string }) => {
      try {
        const file = storeIO.load();
        const nextParties = file.parties.filter((p) => p.name !== args.name);
        if (nextParties.length === file.parties.length) {
          throw new Error(
            `パーティ「${args.name}」が見つかりません。`,
          );
        }
        storeIO.save({
          schemaVersion: CURRENT_PARTY_SCHEMA_VERSION,
          parties: nextParties,
        });
        return toTextResponse({ deleted: true, name: args.name });
      } catch (error: unknown) {
        return toErrorResponse(error);
      }
    },
  );
}
