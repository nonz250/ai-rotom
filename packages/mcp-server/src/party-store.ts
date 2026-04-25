import { randomBytes } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  CURRENT_PARTY_SCHEMA_VERSION,
  partiesFileSchema,
} from "@ai-rotom/shared";
import type { PartiesFile } from "@ai-rotom/shared";

/** ai-rotom の永続化用ディレクトリ名 (ホーム直下)。 */
export const AI_ROTOM_DIR_NAME = ".ai-rotom";
/** パーティ永続化ファイル名。 */
export const PARTIES_FILE_NAME = "parties.json";
/** atomic write 用の一時ファイル拡張子。 */
const TEMP_FILE_EXT = ".tmp";
/** JSON.stringify の indent。 */
const JSON_INDENT = 2;
/** 一時ファイル名用のランダムサフィックスバイト数。 */
const TEMP_SUFFIX_BYTES = 8;

/**
 * 永続化ファイル (`~/.ai-rotom/parties.json`) の絶対パスを返す。
 * ホームディレクトリが解決できない場合はエラーを投げる。
 */
export function resolvePartiesFilePath(): string {
  const home = homedir();
  if (home === "" || home === undefined || home === null) {
    throw new Error(
      "ホームディレクトリが解決できませんでした。$HOME 環境変数を確認してください。",
    );
  }
  return join(home, AI_ROTOM_DIR_NAME, PARTIES_FILE_NAME);
}

/**
 * 永続化ファイルの読み込み結果。
 * 存在しない場合は空の PartiesFile を返す。
 * 破損・権限・schemaVersion 不整合の場合はエラーを投げる。
 */
export function loadPartiesFile(filePath: string = resolvePartiesFilePath()): PartiesFile {
  let raw: string;
  try {
    raw = readFileSync(filePath, { encoding: "utf-8" });
  } catch (error: unknown) {
    if (isNodeErrnoException(error) && error.code === "ENOENT") {
      return { schemaVersion: CURRENT_PARTY_SCHEMA_VERSION, parties: [] };
    }
    throw wrapIoError("パーティファイルの読み込みに失敗しました", error);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error: unknown) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new Error(
      `パーティファイル (${filePath}) の JSON パースに失敗しました: ${cause}`,
    );
  }

  const result = partiesFileSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(
      `パーティファイル (${filePath}) のスキーマ検証に失敗しました: ${issues}`,
    );
  }

  if (result.data.schemaVersion !== CURRENT_PARTY_SCHEMA_VERSION) {
    throw new Error(
      `未対応の schemaVersion (${result.data.schemaVersion}) です。現行は ${CURRENT_PARTY_SCHEMA_VERSION} です。`,
    );
  }

  return result.data;
}

/**
 * 永続化ファイルを atomic に書き込む。
 * 親ディレクトリが存在しない場合は作成する。
 * 一時ファイル → rename で置き換えるため、途中失敗でも元ファイルは壊れない。
 */
export function savePartiesFile(
  data: PartiesFile,
  filePath: string = resolvePartiesFilePath(),
): void {
  const validated = partiesFileSchema.parse(data);

  const dir = dirname(filePath);
  try {
    mkdirSync(dir, { recursive: true });
  } catch (error: unknown) {
    throw wrapIoError(
      `パーティ保存ディレクトリ (${dir}) の作成に失敗しました`,
      error,
    );
  }

  const tempSuffix = randomBytes(TEMP_SUFFIX_BYTES).toString("hex");
  const tempPath = `${filePath}.${tempSuffix}${TEMP_FILE_EXT}`;
  const serialized = JSON.stringify(validated, null, JSON_INDENT);

  try {
    writeFileSync(tempPath, serialized, { encoding: "utf-8", mode: 0o600 });
    renameSync(tempPath, filePath);
  } catch (error: unknown) {
    try {
      rmSync(tempPath, { force: true });
    } catch {
      // クリーンアップ失敗は無視 (元のエラーを優先)。
    }
    throw wrapIoError(
      `パーティファイル (${filePath}) の保存に失敗しました`,
      error,
    );
  }
}

function isNodeErrnoException(
  value: unknown,
): value is NodeJS.ErrnoException {
  return (
    value instanceof Error &&
    typeof (value as NodeJS.ErrnoException).code === "string"
  );
}

function wrapIoError(prefix: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    isNodeErrnoException(error) && error.code !== undefined
      ? ` [${error.code}]`
      : "";
  return new Error(`${prefix}${code}: ${message}`);
}
