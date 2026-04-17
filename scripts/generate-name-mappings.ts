/**
 * @smogon/calc が持つポケモン英語名を元に、外部 API から日本語名を取得し
 * data/champions/pokemon.json の nameJa フィールドを補完するスクリプト。
 *
 * 特性・技・持ち物・性格の日本語名は abilities.json / items.json / moves.json / natures.json の
 * nameJa に統合済みのため、このスクリプトは pokemon.json のみ更新する。
 *
 * 既存エントリの types / baseStats 等の拡張フィールドは保持する。
 *
 * 使い方: npx tsx scripts/generate-name-mappings.ts
 */

import { Generations } from "@smogon/calc";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE = "https://pokeapi.co/api/v2";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(SCRIPT_DIR, "../data/champions");
const POKEMON_FILE = "pokemon.json";
const CHAMPIONS_GEN_NUM = 0;
const REQUEST_DELAY_MS = 100;
const INDENT_SPACES = 2;
const PROGRESS_INTERVAL = 50;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toApiId(englishName: string): string {
  return englishName
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

async function fetchJapaneseName(
  category: string,
  apiId: string
): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE}/${category}/${apiId}`);
    if (!response.ok) return null;

    const data = await response.json();
    const jaName = data.names?.find(
      (n: { language: { name: string }; name: string }) =>
        n.language.name === "ja-Hrkt" || n.language.name === "ja"
    );
    return jaName?.name ?? null;
  } catch {
    return null;
  }
}

// ポケモンのフォルム名のパターン
const FORM_PATTERNS: {
  suffix: RegExp;
  transform: (baseName: string, match: RegExpMatchArray) => string;
}[] = [
  {
    suffix: /^(.+)-Mega-([XY])$/,
    transform: (base, match) => `メガ${base}${match[2]}`,
  },
  {
    suffix: /^(.+)-Mega$/,
    transform: (base) => `メガ${base}`,
  },
  {
    suffix: /^(.+)-Alola$/,
    transform: (base) => `${base}(アローラのすがた)`,
  },
  {
    suffix: /^(.+)-Galar$/,
    transform: (base) => `${base}(ガラルのすがた)`,
  },
  {
    suffix: /^(.+)-Hisui$/,
    transform: (base) => `${base}(ヒスイのすがた)`,
  },
  {
    suffix: /^(.+)-Paldea$/,
    transform: (base) => `${base}(パルデアのすがた)`,
  },
];

async function fetchPokemonJapaneseName(
  englishName: string,
  baseNameCache: Map<string, string>
): Promise<string | null> {
  for (const pattern of FORM_PATTERNS) {
    const match = englishName.match(pattern.suffix);
    if (match) {
      const baseEnName = match[1];
      let baseJaName = baseNameCache.get(baseEnName);
      if (!baseJaName) {
        baseJaName =
          (await fetchJapaneseName("pokemon-species", toApiId(baseEnName))) ??
          undefined;
        if (baseJaName) baseNameCache.set(baseEnName, baseJaName);
      }
      if (baseJaName) {
        return pattern.transform(baseJaName, match);
      }
      return null;
    }
  }

  const jaName = await fetchJapaneseName(
    "pokemon-species",
    toApiId(englishName)
  );
  if (jaName) {
    baseNameCache.set(englishName, jaName);
  }
  return jaName;
}

/**
 * 既存 pokemon.json を読み込み、nameJa が null のエントリに対してのみ外部 API から日本語名を取得する。
 * 既存の他フィールド (types / baseStats / ability 等) は保持して書き戻す。
 */
async function main(): Promise<void> {
  const gen = Generations.get(CHAMPIONS_GEN_NUM);

  // 現在の pokemon.json を読み込んで nameJa の埋まり具合を確認
  const filePath = resolve(DATA_DIR, POKEMON_FILE);
  let existing: Record<string, unknown>[] = [];
  try {
    const content = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content) as unknown;
    if (Array.isArray(parsed)) {
      existing = parsed.filter(
        (x): x is Record<string, unknown> =>
          typeof x === "object" && x !== null
      );
    }
  } catch {
    throw new Error(
      `${filePath} is missing. Run generate-champions-data.ts first.`
    );
  }

  const byName = new Map<string, Record<string, unknown>>();
  for (const entry of existing) {
    const name = entry.name;
    if (typeof name === "string") byName.set(name, entry);
  }

  // @smogon/calc Gen 0 の species を正として欠損チェック
  const missingNames: string[] = [];
  for (const specie of gen.species) {
    const entry = byName.get(specie.name);
    if (!entry || entry.nameJa === null || entry.nameJa === undefined) {
      missingNames.push(specie.name);
    }
  }

  console.log(
    `Total pokemon entries: ${existing.length}, missing nameJa: ${missingNames.length}`
  );
  if (missingNames.length === 0) {
    console.log("Nothing to fetch. Exiting.");
    return;
  }

  const baseNameCache = new Map<string, string>();
  let found = 0;
  let notFound = 0;

  for (const enName of missingNames) {
    const jaName = await fetchPokemonJapaneseName(enName, baseNameCache);
    if (jaName) {
      const entry = byName.get(enName);
      if (entry) entry.nameJa = jaName;
      found++;
    } else {
      console.warn(`  Not found: ${enName}`);
      notFound++;
    }

    await sleep(REQUEST_DELAY_MS);

    if ((found + notFound) % PROGRESS_INTERVAL === 0) {
      console.log(`  Progress: ${found + notFound}/${missingNames.length}`);
    }
  }

  // name の昇順でソートして書き戻す
  existing.sort((a, b) => {
    const an = typeof a.name === "string" ? a.name : "";
    const bn = typeof b.name === "string" ? b.name : "";
    return an.localeCompare(bn);
  });

  writeFileSync(
    filePath,
    JSON.stringify(existing, null, INDENT_SPACES) + "\n"
  );
  console.log(
    `\nDone: ${found} found, ${notFound} not found → ${POKEMON_FILE}`
  );
}

main().catch(console.error);
