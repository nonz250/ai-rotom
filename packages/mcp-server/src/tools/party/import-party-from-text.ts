import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  CURRENT_PARTY_SCHEMA_VERSION,
  MAX_PARTY_MEMBERS,
  MAX_PARTY_MEMO_LENGTH,
  MAX_PARTY_NAME_LENGTH,
  MIN_PARTY_MEMBERS,
  partySchema,
} from "@ai-rotom/shared";
import type { Party, PartiesFile, PartyMember } from "@ai-rotom/shared";
import { NameResolver } from "@ai-rotom/shared";
import {
  abilityNameResolver,
  itemNameResolver,
  moveNameResolver,
  natureNameResolver,
  pokemonNameResolver,
} from "../../name-resolvers.js";
import {
  loadPartiesFile,
  resolvePartiesFilePath,
  savePartiesFile,
} from "../../party-store.js";
import { TOOL_RESPONSE_HINT_CONTENT } from "../../tool-response-hint.js";
import {
  mapPokesolResultToPartyMember,
  splitPokesolTextBlocks,
} from "../../party-text.js";
import { parse } from "@pokesol/pokesol-text-parser-ts";

const TOOL_NAME = "import_party_from_text";
const TOOL_DESCRIPTION =
  "ポケソルテキスト (Showdown 風に 1 匹あたり 3〜6 行・複数匹は空行区切り) からパーティを一括取り込みして保存する (upsert)。各メンバーはポケモン名 / 特性 / 性格 / 技 / 持ち物をポケチャン内の既知データと照合する。エラーがある場合は部分保存せず全体を失敗させる。";

/** ポケソルテキスト入力の最大文字数 (6 匹 × 数百文字 + メモ想定)。 */
const MAX_POKESOL_TEXT_LENGTH = 8000;

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
 * import_party_from_text に注入する依存関係。
 */
export interface ImportPartyFromTextDeps {
  storeIO?: PartyStoreIO;
  now?: NowProvider;
}

const inputSchema = {
  text: z
    .string()
    .min(1, { message: "ポケソルテキストは 1 文字以上で指定してください。" })
    .max(MAX_POKESOL_TEXT_LENGTH, {
      message: `ポケソルテキストは ${MAX_POKESOL_TEXT_LENGTH} 文字以下で指定してください。`,
    })
    .describe(
      "ポケソルテキスト。1 匹あたり 3〜6 行 (ポケモン名[@持ち物] / テラスタイプ行 省略可 / 特性 / 能力補正 / 実数値(SP) 省略可 / 技 省略可)。複数匹は空行で区切る。",
    ),
  name: z
    .string()
    .min(1, { message: "パーティ名は 1 文字以上で指定してください。" })
    .max(MAX_PARTY_NAME_LENGTH, {
      message: `パーティ名は ${MAX_PARTY_NAME_LENGTH} 文字以下で指定してください。`,
    })
    .describe("保存名 (識別子。同名は上書き)。"),
  memo: z
    .string()
    .max(MAX_PARTY_MEMO_LENGTH, {
      message: `メモは ${MAX_PARTY_MEMO_LENGTH} 文字以下で指定してください。`,
    })
    .optional()
    .describe("構築メモ (自由記述)。"),
};

interface ImportInput {
  text: string;
  name: string;
  memo?: string;
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

/**
 * NameResolver の既知名 (日英どちらでも) として存在するかを判定する。
 * 未知の場合は類似候補付きのメッセージを投げる。
 */
function assertKnownName(
  resolver: NameResolver,
  name: string,
  label: string,
  blockNumber: number,
): void {
  if (resolver.hasJapaneseName(name) || resolver.hasEnglishName(name)) {
    return;
  }
  const suggestions = resolver.suggestSimilar(name, 3);
  const suggestionMessage =
    suggestions.length > 0 ? ` もしかして: ${suggestions.join(", ")}` : "";
  throw new Error(
    `ブロック ${blockNumber}: ${label}「${name}」が見つかりません。${suggestionMessage}`,
  );
}

/**
 * PartyMember の各名前フィールドを NameResolver で検証する。
 * 未知名があれば該当ブロックのエラーとして throw。
 */
function validateMemberNames(member: PartyMember, blockNumber: number): void {
  assertKnownName(pokemonNameResolver, member.name, "ポケモン名", blockNumber);
  if (member.nature !== undefined) {
    assertKnownName(natureNameResolver, member.nature, "性格", blockNumber);
  }
  if (member.ability !== undefined) {
    assertKnownName(abilityNameResolver, member.ability, "特性", blockNumber);
  }
  if (member.item !== undefined) {
    assertKnownName(itemNameResolver, member.item, "持ち物", blockNumber);
  }
  if (member.moves !== undefined) {
    for (const move of member.moves) {
      assertKnownName(moveNameResolver, move, "技", blockNumber);
    }
  }
}

/**
 * 本ツールの全処理 (split → parse → map → validate → persist) を実行する。
 * テストから直接呼び出せるようエクスポートする。
 */
export function runImportPartyFromText(
  input: ImportInput,
  deps: ImportPartyFromTextDeps = {},
): {
  saved: boolean;
  party: Party;
  warnings: string[];
  filePath: string;
  overwrote: boolean;
} {
  const storeIO = deps.storeIO ?? defaultStoreIO;
  const now = deps.now ?? defaultNowProvider;

  const blocks = splitPokesolTextBlocks(input.text);
  if (blocks.length < MIN_PARTY_MEMBERS) {
    throw new Error(
      `パーティには ${MIN_PARTY_MEMBERS} 匹以上を含めてください (検出: ${blocks.length} 匹)。`,
    );
  }
  if (blocks.length > MAX_PARTY_MEMBERS) {
    throw new Error(
      `パーティには ${MAX_PARTY_MEMBERS} 匹までしか含められません (検出: ${blocks.length} 匹)。`,
    );
  }

  const warnings: string[] = [];
  const members: PartyMember[] = [];
  blocks.forEach((block, index) => {
    const blockNumber = index + 1;
    let parsed;
    try {
      parsed = parse(block);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `ブロック ${blockNumber} のパースに失敗しました: ${reason}`,
      );
    }
    const mapped = mapPokesolResultToPartyMember(parsed, blockNumber);
    validateMemberNames(mapped.member, blockNumber);
    members.push(mapped.member);
    warnings.push(...mapped.warnings);
  });

  const file = storeIO.load();
  const existingIndex = file.parties.findIndex((p) => p.name === input.name);
  const nowIso = now().toISOString();
  const createdAt =
    existingIndex >= 0 ? file.parties[existingIndex]!.createdAt : nowIso;

  const party: Party = {
    name: input.name,
    members,
    createdAt,
    updatedAt: nowIso,
  };
  if (input.memo !== undefined) {
    party.memo = input.memo;
  }

  // 最終的にスキーマ全体を検証してから永続化する (SP 合計 / メンバー数 / 技数 等の二重防御)。
  partySchema.parse(party);

  const nextParties = [...file.parties];
  if (existingIndex >= 0) {
    nextParties[existingIndex] = party;
  } else {
    nextParties.push(party);
  }
  storeIO.save({
    schemaVersion: CURRENT_PARTY_SCHEMA_VERSION,
    parties: nextParties,
  });

  return {
    saved: true,
    party,
    warnings,
    filePath: resolvePartiesFilePath(),
    overwrote: existingIndex >= 0,
  };
}

/**
 * import_party_from_text ツールをサーバーに登録する。
 */
export function registerImportPartyFromTextTool(
  server: McpServer,
  deps: ImportPartyFromTextDeps = {},
): void {
  server.tool(
    TOOL_NAME,
    TOOL_DESCRIPTION,
    inputSchema,
    async (args: ImportInput) => {
      try {
        return toTextResponse(runImportPartyFromText(args, deps));
      } catch (error: unknown) {
        return toErrorResponse(error);
      }
    },
  );
}
