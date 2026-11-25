/** 実行環境に依存しない、リモート版の設定。 */
export interface RemoteServerConfig {
  /** MCP エンドポイントの認証に使う共有トークン。未設定か短すぎるなら全リクエストを拒否する。 */
  authToken: string | undefined;
  /** 認証なしで受け付けるか。true なら authToken は使わない。 */
  allowAnonymous: boolean;
  /** 全技系ツールで自分側の技構成を必須にするか。 */
  requireMoves: boolean;
  /** 受け付けるホスト名。小文字にそろえてある。undefined ならホスト名を確かめない。 */
  allowedHosts: readonly string[] | undefined;
}

/** 環境変数の集まり。サービスによっては、値が文字列ではなく真偽値などで渡ってくる。 */
export type ConfigSource = Readonly<Record<string, unknown>>;

const REQUIRE_MOVES_DISABLED = "false";
const ALLOW_ANONYMOUS_ENABLED = "true";
const ALLOWED_HOSTS_SEPARATOR = ",";

/** 認証トークンとして受け付ける最短の文字数。`openssl rand -hex 16` の出力と同じ長さ。 */
export const MIN_AUTH_TOKEN_LENGTH = 32;

/**
 * 環境変数から設定を読む。
 *
 * - AUTH_TOKEN: 認証トークン。MIN_AUTH_TOKEN_LENGTH 文字に満たなければ未設定として扱う
 * - ALLOW_ANONYMOUS: true のときだけ認証なしで受け付ける。読み違えで誰でも呼べる状態に
 *   ならないよう、true 以外はすべて認証を求める
 * - REQUIRE_MOVES: false のときだけ技構成を任意にする。1 リクエストの CPU 時間に上限がある
 *   環境では習得技すべての計算が上限を超えるため、未設定なら必須にする
 * - ALLOWED_HOSTS: 受け付けるホスト名のカンマ区切り。前後の空白と空の要素は無視する。
 *   ホスト名が 1 つもなければ未設定として扱う
 */
export function loadConfig(source: ConfigSource): RemoteServerConfig {
  const authToken = source.AUTH_TOKEN;
  return {
    authToken:
      typeof authToken === "string" && authToken.length >= MIN_AUTH_TOKEN_LENGTH
        ? authToken
        : undefined,
    // 真偽値で渡ってくるサービスもあるので、文字列にそろえて比べる。
    allowAnonymous: normalizeFlag(source.ALLOW_ANONYMOUS) === ALLOW_ANONYMOUS_ENABLED,
    requireMoves: normalizeFlag(source.REQUIRE_MOVES) !== REQUIRE_MOVES_DISABLED,
    allowedHosts: parseAllowedHosts(source.ALLOWED_HOSTS),
  };
}

function normalizeFlag(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function parseAllowedHosts(value: unknown): readonly string[] | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const hosts = value
    .split(ALLOWED_HOSTS_SEPARATOR)
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host !== "");
  return hosts.length === 0 ? undefined : hosts;
}
