import { loadConfig, type ConfigSource } from "../config.js";
import { createRequestHandler, type ClientAddressResolver, type RateLimiter } from "../handler.js";

/** Workers の型定義パッケージは読み込んでいないので、Rate Limiting バインディングのうち使う部分だけ型を書く。 */
interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

type Env = ConfigSource & { RATE_LIMITER?: RateLimitBinding };

/**
 * バインディングは期間を返さないので、wrangler.toml の [[ratelimits]] の period と同じ値をここにも持つ。
 * 期間ごとに数え直すので、最長でもこの秒数待てば次のリクエストが通る。
 */
const RATE_LIMIT_PERIOD_SECONDS = 60;

function rateLimiterFrom(binding: RateLimitBinding | undefined): RateLimiter | undefined {
  if (binding === undefined) {
    return undefined;
  }
  return {
    retryAfterSeconds: RATE_LIMIT_PERIOD_SECONDS,
    async allow(key) {
      return (await binding.limit({ key })).success;
    },
  };
}

/** Cloudflare は接続元のアドレスをこのヘッダーに入れる。クライアントが送った同名のヘッダーは上書きされる。 */
const clientAddressOf: ClientAddressResolver = (request) =>
  request.headers.get("cf-connecting-ip");

/**
 * Cloudflare Workers のエントリ。wrangler.toml の main から参照する。
 * 環境変数は [vars] と wrangler secret から env に渡ってくる。[vars] に引用符なしで書いた
 * false は真偽値のまま渡ってくるが、loadConfig が文字列と同じように扱う。
 */
export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return createRequestHandler(
      loadConfig(env),
      rateLimiterFrom(env.RATE_LIMITER),
      clientAddressOf,
    )(request);
  },
};
