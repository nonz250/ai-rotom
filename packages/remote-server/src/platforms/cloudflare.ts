import { loadConfig, type ConfigSource } from "../config.js";
import { createRequestHandler } from "../handler.js";

/**
 * Cloudflare Workers のエントリ。wrangler.toml の main から参照する。
 * 環境変数は [vars] と wrangler secret から env に渡ってくる。[vars] に引用符なしで書いた
 * false は真偽値のまま渡ってくるが、loadConfig が文字列と同じように扱う。
 */
export default {
  fetch(request: Request, env: ConfigSource): Promise<Response> {
    return createRequestHandler(loadConfig(env))(request);
  },
};
