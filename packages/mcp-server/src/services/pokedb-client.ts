import https from "node:https";
import { cacheGet, cacheSet } from "./meta-cache.js";
import { resolveMegaStone } from "./mega-resolver.js";

/**
 * pokedb.tokyo (champs.pokedb.tokyo) クライアント。
 * pokedb.tokyo HTTP / HTML パーサ層 (Node 標準 https + 正規表現)。
 * - HTTP: Node 標準 https モジュール、UA 必須、503/429 で指数バックオフ最大 5 回
 * - パース: 正規表現 + tag2pipe (cheerio/jsdom 不採用)
 * - キャッシュ: ~/.cache/ai-rotom/ に 24h TTL
 */

const POKEDB_BASE = "https://champs.pokedb.tokyo";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0";

// pokedb.tokyo の独自表記 → 正規表記
const POKEDB_TO_DICT_ITEM: Record<string, string> = {
  "カイリュナイト": "カイリューナイト",
  "マフォクシナイト": "マフォクシーナイト",
  "スターミナイト": "スターミーナイト",
  "ピクシナイト": "ピクシーナイト",
  "スコヴィラナイト": "スコヴィランナイト",
};

const POKEDB_TO_DICT_SPECIES: Record<string, string> = {
  "フラエッテ:永遠": "フラエッテ(Eternal)",
  "イダイトウ (オス)": "イダイトウ",
  "イダイトウ (メス)": "イダイトウ(F)",
  "ウォッシュロトム": "ロトム(Wash)",
  "ヒートロトム": "ロトム(Heat)",
  "キュウコン (アローラ)": "アローラキュウコン",
  "ヌメルゴン (ヒスイ)": "ヒスイヌメルゴン",
  "ゾロアーク (ヒスイ)": "ヒスイゾロアーク",
  "ヤドキング (ガラル)": "ガラルヤドキング",
  "ダイケンキ (ヒスイ)": "ヒスイダイケンキ",
  "ウインディ (ヒスイ)": "ヒスイウインディ",
};

export function normalizePokedbItem(name: string): string {
  return POKEDB_TO_DICT_ITEM[name] ?? name;
}

export function normalizePokedbSpecies(name: string): string {
  return POKEDB_TO_DICT_SPECIES[name] ?? name;
}

const sleepMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface FetchOnceResult {
  status: number;
  body: string;
}

function fetchHtmlOnce(url: string): Promise<FetchOnceResult> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": UA } }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf-8"),
          }),
        );
      })
      .on("error", reject);
  });
}

export async function fetchHtml(url: string): Promise<string> {
  let waitMs = 5000;
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetchHtmlOnce(url);
    if (r.status === 200) return r.body;
    if (r.status === 503 || r.status === 429) {
      console.error(`[fetchHtml] ${r.status} on attempt ${attempt + 1}, waiting ${waitMs / 1000}s`);
      await sleepMs(waitMs);
      waitMs *= 2;
      continue;
    }
    throw new Error(`HTTP ${r.status} for ${url}`);
  }
  throw new Error(`max retries for ${url}`);
}

/** EUC-JP 対応 (yakkun.com 用、現時点では未使用) */
export function fetchHtmlEucJp(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": UA } }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve(new TextDecoder("euc-jp").decode(Buffer.concat(chunks))),
        );
      })
      .on("error", reject);
  });
}

let _pokedbSlugMap: Record<string, string> | null = null;

export async function loadPokedbSlugMap(): Promise<Record<string, string>> {
  if (_pokedbSlugMap) return _pokedbSlugMap;
  const cacheKey = "pokedb-slug-map";
  const cached = cacheGet<Record<string, string>>(cacheKey);
  if (cached) {
    _pokedbSlugMap = cached;
    return cached;
  }
  const html = await fetchHtml(POKEDB_BASE + "/pokemon/list?rule=0");
  const re = /<a href="\/pokemon\/show\/(\d{4}-\d{2})\?[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  const map: Record<string, string> = {};
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1]!;
    const inner = m[2]!;
    const nameMatch = inner.match(/<span[^>]*class="[^"]*pokemon-name[^"]*"[^>]*>([^<]+)<\/span>/);
    if (nameMatch) {
      map[nameMatch[1]!.trim()] = slug;
    } else {
      const txt = inner
        .replace(/<[^>]+>/g, "|")
        .split("|")
        .map((s) => s.trim())
        .filter((s) => s && /^[ぁ-んァ-ヶー一-龥]/.test(s) && s.length > 1);
      if (txt.length > 0) map[txt[0]!] = slug;
    }
  }
  _pokedbSlugMap = map;
  cacheSet(cacheKey, map);
  return map;
}

function tag2pipe(html: string): string {
  return html
    .replace(/<[^>]+>/g, "|")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .replace(/\|[\s|]+/g, "|");
}

function getSection(html: string, sectionName: string): string {
  const start = html.indexOf("<h3>" + sectionName + "</h3>");
  if (start < 0) return "";
  const next = html.indexOf("<h3>", start + 10);
  return html.slice(start, next > 0 ? next : start + 10000);
}

export interface RankedItem {
  rank: number;
  name: string;
  percentage: number;
}

export interface PartnerItem {
  rank: number;
  name: string;
  percentage?: number;
}

/** 「|名前|数値|%|」(技セクション、番号なし) */
export function parseMovesSection(html: string): RankedItem[] {
  const text = tag2pipe(html);
  const items: RankedItem[] = [];
  const re = /\|([ぁ-んァ-ヶー一-龥]+)\|([\d.]+)\|%/g;
  let m: RegExpExecArray | null;
  let rank = 0;
  while ((m = re.exec(text)) !== null) {
    items.push({ rank: ++rank, name: m[1]!.trim(), percentage: parseFloat(m[2]!) });
  }
  return items;
}

/** 「|番号|名前|数値%|」(特性、持ち物) */
export function parseRankedListSection(html: string): RankedItem[] {
  const text = tag2pipe(html);
  const items: RankedItem[] = [];
  const re = /\|(\d+)\|([^|0-9][^|]{0,30})\|([\d.]+)%/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const name = m[2]!.trim();
    const pct = parseFloat(m[3]!);
    if (name && pct >= 0 && pct <= 100) {
      items.push({ rank: parseInt(m[1]!, 10), name, percentage: pct });
    }
  }
  return items;
}

/** 「|番号|名前|(↑↓)|数値%|」(能力補正) */
export function parseNaturesSection(html: string): RankedItem[] {
  const text = tag2pipe(html);
  const items: RankedItem[] = [];
  const re = /\|(\d+)\|([ぁ-んァ-ヶー一-龥]+)\s*\|\([^)]+\|\)\|([\d.]+)%/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    items.push({
      rank: parseInt(m[1]!, 10),
      name: m[2]!.trim(),
      percentage: parseFloat(m[3]!),
    });
  }
  return items;
}

/** 「|番号|名前|...」% なし (同じチーム=パートナー) */
export function parsePartnersSection(html: string): PartnerItem[] {
  const text = tag2pipe(html);
  const items: PartnerItem[] = [];
  const re = /\|(\d+)\|([ぁ-んァ-ヶー一-龥A-Za-z]+(?:\s*\([^)]+\))?)\s*(?=\|)/g;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(text)) !== null) {
    const name = m[2]!.trim();
    if (seen.has(name)) continue;
    seen.add(name);
    items.push({ rank: parseInt(m[1]!, 10), name });
  }
  return items;
}

export interface PokemonMeta {
  moves: RankedItem[];
  abilities: RankedItem[];
  natures: RankedItem[];
  items: RankedItem[];
  partners: PartnerItem[];
  _slug?: string;
}

export type Format = "single" | "double";

/** 個別ポケモンの採用率データ */
export async function fetchPokemonMeta(
  speciesJa: string,
  format: Format = "single",
): Promise<PokemonMeta> {
  const ruleId = format === "double" ? 1 : 0;
  const cacheKey = `pokedb-${speciesJa}-rule${ruleId}`;
  const cached = cacheGet<PokemonMeta>(cacheKey);
  if (cached) return cached;

  const slugMap = await loadPokedbSlugMap();
  const slug = slugMap[speciesJa];
  if (!slug) {
    return { moves: [], abilities: [], natures: [], items: [], partners: [] };
  }

  const url = `${POKEDB_BASE}/pokemon/show/${slug}?rule=${ruleId}`;
  const html = await fetchHtml(url);
  const result: PokemonMeta = {
    moves: parseMovesSection(getSection(html, "技")),
    abilities: parseRankedListSection(getSection(html, "特性")),
    natures: parseNaturesSection(getSection(html, "能力補正")),
    items: parseRankedListSection(getSection(html, "持ち物")),
    partners: parsePartnersSection(getSection(html, "同じチーム")),
    _slug: slug,
  };
  if (result.moves.length > 0 || result.items.length > 0) {
    cacheSet(cacheKey, result);
  }
  return result;
}

export interface MetaTopEntry {
  rank: number;
  ja: string;
  slug: string;
}

/** 環境上位 N 体ランキング (採用率順) */
export async function fetchMetaTop(
  n = 50,
  format: Format = "single",
): Promise<MetaTopEntry[]> {
  const ruleId = format === "double" ? 1 : 0;
  const cacheKey = `pokedb-top-rule${ruleId}`;
  const cached = cacheGet<MetaTopEntry[]>(cacheKey);
  if (cached) return cached.slice(0, n);

  const html = await fetchHtml(POKEDB_BASE + "/pokemon/list?rule=" + ruleId);
  const re = /<a href="\/pokemon\/show\/(\d{4}-\d{2})\?[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  const all: MetaTopEntry[] = [];
  let m: RegExpExecArray | null;
  let rank = 1;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1]!;
    const inner = m[2]!;
    const nameMatch = inner.match(/<span[^>]*class="[^"]*pokemon-name[^"]*"[^>]*>([^<]+)<\/span>/);
    let ja = nameMatch ? nameMatch[1]!.trim() : null;
    if (!ja) {
      const txt = inner
        .replace(/<[^>]+>/g, "|")
        .split("|")
        .map((s) => s.trim())
        .filter((s) => s && /^[ぁ-んァ-ヶー一-龥]/.test(s) && s.length > 1);
      if (txt.length > 0) ja = txt[0]!;
    }
    if (ja) {
      all.push({ rank: rank++, ja, slug });
    }
  }
  if (all.length > 0) cacheSet(cacheKey, all);
  return all.slice(0, n);
}

export interface MegaInfo {
  species: string;
  stone: string;
  stoneRate: number;
  ability: string | null;
  baseStats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
}

export interface TypicalSet {
  species: string;
  variants: { nature: string; sharePct: number; label: string }[];
  ability: string;
  topItems: string[];
  topMoves: string[];
  megaInfo: MegaInfo | null;
  megaInfos: MegaInfo[];
  summary: string;
  note?: string;
}

/** 主流型サマリ。採用率の分布から 1〜3 型を自動判別。メガ複数も検出。 */
export async function fetchTypicalSet(
  speciesJa: string,
  format: Format = "single",
): Promise<TypicalSet> {
  const m = await fetchPokemonMeta(speciesJa, format);
  const natures = m.natures ?? [];
  if (natures.length === 0) {
    return {
      species: speciesJa,
      variants: [],
      ability: "?",
      topItems: [],
      topMoves: [],
      megaInfo: null,
      megaInfos: [],
      summary: "データなし",
      note: "データなし",
    };
  }

  const main: RankedItem[] = [natures[0]!];
  if (
    natures[1] &&
    natures[1].percentage >= 20 &&
    natures[0]!.percentage - natures[1].percentage <= 30
  ) {
    main.push(natures[1]);
    if (natures[2] && natures[2].percentage >= 15) main.push(natures[2]);
  }

  const megaInfos: MegaInfo[] = [];
  for (const item of m.items ?? []) {
    if (!/ナイト[ＸＹXY]?$/.test(item.name)) continue;
    if (item.percentage < 20) break;
    const stoneJa = normalizePokedbItem(item.name);
    const mega = resolveMegaStone(stoneJa);
    if (!mega) continue;
    megaInfos.push({
      species: mega.speciesJa,
      stone: stoneJa,
      stoneRate: item.percentage,
      ability: mega.abilityJa,
      baseStats: mega.baseStats,
    });
  }
  const megaInfo = megaInfos[0] ?? null;

  return {
    species: speciesJa,
    variants: main.map((n) => ({
      nature: n.name,
      sharePct: n.percentage,
      label: `${n.name} ${n.percentage}%`,
    })),
    ability:
      m.abilities && m.abilities[0]
        ? `${m.abilities[0].name}(${m.abilities[0].percentage}%)`
        : "?",
    topItems: (m.items ?? []).slice(0, 4).map((x) => `${x.name}(${x.percentage}%)`),
    topMoves: (m.moves ?? []).slice(0, 6).map((x) => `${x.name}(${x.percentage}%)`),
    megaInfo,
    megaInfos,
    summary:
      main.length === 1
        ? `${main[0]!.name} 単一型 (採用率${main[0]!.percentage}%)`
        : `${main.length}型 拮抗: ${main.map((n) => `${n.name} ${n.percentage}%`).join(" / ")}`,
  };
}

export interface WarmCacheResult {
  depth: number;
  fetched: number;
  cached: number;
  failed: number;
  elapsed: string;
}

/** 環境上位N体のメタを並列で事前取得 */
export async function warmMetaCache(
  depth = 50,
  concurrency = 10,
): Promise<WarmCacheResult> {
  const start = Date.now();
  const top = await fetchMetaTop(depth);
  const queue = [...top];
  let fetched = 0;
  let cached = 0;
  let failed = 0;

  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const p = queue.shift();
      if (!p) break;
      const cacheKey = `pokedb-${p.ja}-rule0`;
      if (cacheGet(cacheKey)) {
        cached++;
        continue;
      }
      try {
        const m = await fetchPokemonMeta(p.ja);
        if ((m.moves?.length ?? 0) > 0 || (m.items?.length ?? 0) > 0) {
          fetched++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }
  });
  await Promise.all(workers);

  return {
    depth: top.length,
    fetched,
    cached,
    failed,
    elapsed: `${((Date.now() - start) / 1000).toFixed(1)}s`,
  };
}
