import { z } from "zod";
import { evsSchema } from "./stats.js";
import type { Party, PartiesFile, PartyMember } from "../types/party.js";

/** パーティ名の最大文字数。 */
export const MAX_PARTY_NAME_LENGTH = 50;
/** メモの最大文字数。 */
export const MAX_PARTY_MEMO_LENGTH = 4000;
/** パーティに所属できるポケモンの最小数。 */
export const MIN_PARTY_MEMBERS = 1;
/** パーティに所属できるポケモンの最大数。 */
export const MAX_PARTY_MEMBERS = 6;
/** 1 匹あたりの技の最大数。 */
export const MAX_MOVES_PER_MEMBER = 4;
/** ポケモン名・性格・特性・持ち物・技名の最大文字数 (入力ゆらぎ許容)。 */
export const MAX_NAME_LENGTH = 100;

/** 現行のパーティファイル schemaVersion。 */
export const CURRENT_PARTY_SCHEMA_VERSION = 1;

const nameField = z
  .string()
  .min(1, { message: "名前は 1 文字以上で指定してください。" })
  .max(MAX_NAME_LENGTH, {
    message: `名前は ${MAX_NAME_LENGTH} 文字以下で指定してください。`,
  });

const optionalNameField = nameField.optional();

/**
 * パーティに所属する 1 匹分の入力スキーマ。
 */
export const partyMemberSchema: z.ZodType<PartyMember> = z.object({
  name: nameField.describe("ポケモン名 (日本語 or 英語)。"),
  nature: optionalNameField.describe("性格名 (日本語 or 英語)。"),
  ability: optionalNameField.describe("特性名 (日本語 or 英語)。"),
  item: optionalNameField.describe("持ち物名 (日本語 or 英語)。"),
  evs: evsSchema.optional().describe("能力ポイント (SP) の配分。"),
  moves: z
    .array(nameField)
    .max(MAX_MOVES_PER_MEMBER, {
      message: `技は ${MAX_MOVES_PER_MEMBER} 個までです。`,
    })
    .optional()
    .describe("技リスト (日本語 or 英語、最大 4)。"),
});

const isoDateTimeField = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "ISO 8601 形式の日時文字列で指定してください。",
  });

/**
 * 1 パーティ分の入力スキーマ。
 */
export const partySchema: z.ZodType<Party> = z.object({
  name: z
    .string()
    .min(1, { message: "パーティ名は 1 文字以上で指定してください。" })
    .max(MAX_PARTY_NAME_LENGTH, {
      message: `パーティ名は ${MAX_PARTY_NAME_LENGTH} 文字以下で指定してください。`,
    })
    .describe("パーティの識別子。"),
  memo: z
    .string()
    .max(MAX_PARTY_MEMO_LENGTH, {
      message: `メモは ${MAX_PARTY_MEMO_LENGTH} 文字以下で指定してください。`,
    })
    .optional()
    .describe("自由記述メモ。"),
  members: z
    .array(partyMemberSchema)
    .min(MIN_PARTY_MEMBERS, {
      message: `パーティには ${MIN_PARTY_MEMBERS} 匹以上を含めてください。`,
    })
    .max(MAX_PARTY_MEMBERS, {
      message: `パーティには ${MAX_PARTY_MEMBERS} 匹までしか含められません。`,
    })
    .describe("1〜6 匹のメンバー。"),
  createdAt: isoDateTimeField.describe("作成日時 (ISO 8601)。"),
  updatedAt: isoDateTimeField.describe("更新日時 (ISO 8601)。"),
});

/**
 * `~/.ai-rotom/parties.json` 全体のスキーマ。
 */
export const partiesFileSchema: z.ZodType<PartiesFile> = z.object({
  schemaVersion: z
    .number()
    .int()
    .positive()
    .describe("パーティファイルの schemaVersion。"),
  parties: z.array(partySchema).describe("登録済みパーティの一覧。"),
});
