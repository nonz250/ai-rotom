import type { EvsInput } from "../schemas/stats.js";

/**
 * パーティに所属するポケモン 1 匹分のビルド情報。
 * name 以外は省略可能 (未決定の枠を保存できるようにする)。
 */
export interface PartyMember {
  /** ポケモン名 (日本語 or 英語)。 */
  name: string;
  /** 性格名 (日本語 or 英語)。 */
  nature?: string;
  /** 特性名 (日本語 or 英語)。 */
  ability?: string;
  /** 持ち物名 (日本語 or 英語)。 */
  item?: string;
  /** 能力ポイント (SP) の配分。 */
  evs?: EvsInput;
  /** 技リスト (最大 4)。 */
  moves?: string[];
}

/**
 * 1 パーティ分の情報。
 * name をキー (識別子) として扱い、同名の save は上書き (upsert)。
 */
export interface Party {
  /** 表示名 (識別子)。例: "メインパ"。 */
  name: string;
  /** 構築意図・戦績・相性メモ等の自由記述。 */
  memo?: string;
  /** 1〜6 匹のメンバー。 */
  members: PartyMember[];
  /** ISO 8601 形式の作成日時。 */
  createdAt: string;
  /** ISO 8601 形式の更新日時。 */
  updatedAt: string;
}

/**
 * `~/.ai-rotom/parties.json` の永続化スキーマ。
 * schemaVersion は将来の migration のために保持する。
 */
export interface PartiesFile {
  schemaVersion: number;
  parties: Party[];
}
