/** 実行環境に依存しない、リモート版の設定。 */
export interface RemoteServerConfig {
  /** MCP エンドポイントの認証に使う共有トークン。未設定か短すぎるなら全リクエストを拒否する。 */
  authToken: string | undefined;
  /** 全技系ツールで自分側の技構成を必須にするか。 */
  requireMoves: boolean;
}

/** 環境変数の集まり。サービスによっては、値が文字列ではなく真偽値などで渡ってくる。 */
export type ConfigSource = Readonly<Record<string, unknown>>;

const REQUIRE_MOVES_DISABLED = "false";

/** 認証トークンとして受け付ける最短の文字数。`openssl rand -hex 16` の出力と同じ長さ。 */
export const MIN_AUTH_TOKEN_LENGTH = 32;

/**
 * 環境変数から設定を読む。
 *
 * - AUTH_TOKEN: 認証トークン。MIN_AUTH_TOKEN_LENGTH 文字に満たなければ未設定として扱う
 * - REQUIRE_MOVES: false のときだけ技構成を任意にする。1 リクエストの CPU 時間に上限がある
 *   環境では習得技すべての計算が上限を超えるため、未設定なら必須にする
 */
export function loadConfig(source: ConfigSource): RemoteServerConfig {
  const authToken = source.AUTH_TOKEN;
  return {
    authToken:
      typeof authToken === "string" && authToken.length >= MIN_AUTH_TOKEN_LENGTH
        ? authToken
        : undefined,
    // 真偽値で渡ってくるサービスもあるので、文字列にそろえて比べる。
    requireMoves:
      String(source.REQUIRE_MOVES ?? "").trim().toLowerCase() !== REQUIRE_MOVES_DISABLED,
  };
}
