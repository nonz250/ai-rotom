import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * pokedb.tokyo / yakkun などの外部 API レスポンス用ディスクキャッシュ。
 * デフォルト: ~/.cache/ai-rotom/, TTL 24h。
 * AI_ROTOM_CACHE_DIR 環境変数で上書き可能 (Claude Desktop 等のサンドボックス向け)。
 */
const CACHE_DIR =
  process.env.AI_ROTOM_CACHE_DIR ?? join(homedir(), ".cache", "ai-rotom");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

export function cacheGet<T = unknown>(key: string): T | null {
  ensureCacheDir();
  const f = join(CACHE_DIR, `${key}.json`);
  if (!existsSync(f)) return null;
  const stat = statSync(f);
  if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null;
  try {
    return JSON.parse(readFileSync(f, "utf-8")) as T;
  } catch {
    return null;
  }
}

export function cacheSet(key: string, value: unknown): void {
  ensureCacheDir();
  writeFileSync(join(CACHE_DIR, `${key}.json`), JSON.stringify(value));
}

export function cacheDir(): string {
  return CACHE_DIR;
}
