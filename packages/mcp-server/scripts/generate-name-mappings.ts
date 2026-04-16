/**
 * @smogon/calc が持つ英語名リストを元に、外部 API から日本語名を取得し
 * 名前変換マッピング JSON を生成するスクリプト。
 *
 * 使い方: npx tsx packages/mcp-server/scripts/generate-name-mappings.ts
 */

import { Generations } from "@smogon/calc";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const API_BASE = "https://pokeapi.co/api/v2";
const DATA_DIR = resolve(import.meta.dirname, "../data");
const CHAMPIONS_GEN_NUM = 0;
const REQUEST_DELAY_MS = 100;

interface NameEntry {
  ja: string;
  en: string;
}

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
  // フォルム名のチェック
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

  // 通常の種族名
  const jaName = await fetchJapaneseName(
    "pokemon-species",
    toApiId(englishName)
  );
  if (jaName) {
    baseNameCache.set(englishName, jaName);
  }
  return jaName;
}

async function generatePokemonMappings(
  englishNames: string[],
  outputFile: string
): Promise<void> {
  console.log(`\n--- pokemon-species (${englishNames.length} entries) ---`);

  const entries: NameEntry[] = [];
  const baseNameCache = new Map<string, string>();
  let found = 0;
  let notFound = 0;

  for (const enName of englishNames) {
    const jaName = await fetchPokemonJapaneseName(enName, baseNameCache);
    if (jaName) {
      entries.push({ ja: jaName, en: enName });
      found++;
    } else {
      console.warn(`  Not found: ${enName}`);
      notFound++;
    }

    await sleep(REQUEST_DELAY_MS);

    if ((found + notFound) % 50 === 0) {
      console.log(`  Progress: ${found + notFound}/${englishNames.length}`);
    }
  }

  entries.sort((a, b) => a.en.localeCompare(b.en));

  const outputPath = resolve(DATA_DIR, outputFile);
  writeFileSync(outputPath, JSON.stringify(entries, null, 2) + "\n");
  console.log(
    `  Done: ${found} found, ${notFound} not found → ${outputFile}`
  );
}

async function generateMappings(
  category: string,
  englishNames: string[],
  outputFile: string
): Promise<void> {
  console.log(`\n--- ${category} (${englishNames.length} entries) ---`);

  const entries: NameEntry[] = [];
  let found = 0;
  let notFound = 0;

  for (const enName of englishNames) {
    if (enName === "(No Move)") continue;

    const jaName = await fetchJapaneseName(category, toApiId(enName));
    if (jaName) {
      entries.push({ ja: jaName, en: enName });
      found++;
    } else {
      console.warn(`  Not found: ${enName}`);
      notFound++;
    }

    await sleep(REQUEST_DELAY_MS);

    if ((found + notFound) % 50 === 0) {
      console.log(`  Progress: ${found + notFound}/${englishNames.length}`);
    }
  }

  entries.sort((a, b) => a.en.localeCompare(b.en));

  const outputPath = resolve(DATA_DIR, outputFile);
  writeFileSync(outputPath, JSON.stringify(entries, null, 2) + "\n");
  console.log(
    `  Done: ${found} found, ${notFound} not found → ${outputFile}`
  );
}

async function main(): Promise<void> {
  const gen = Generations.get(CHAMPIONS_GEN_NUM);

  const pokemonNames: string[] = [];
  for (const s of gen.species) pokemonNames.push(s.name);

  const moveNames: string[] = [];
  for (const m of gen.moves) moveNames.push(m.name);

  const abilityNames: string[] = [];
  for (const a of gen.abilities) abilityNames.push(a.name);

  const itemNames: string[] = [];
  for (const i of gen.items) itemNames.push(i.name);

  console.log("Generating name mappings from external API...");
  console.log(
    `Pokemon: ${pokemonNames.length}, Moves: ${moveNames.length}, Abilities: ${abilityNames.length}, Items: ${itemNames.length}`
  );

  await generatePokemonMappings(pokemonNames, "pokemon-names.json");
  await generateMappings("move", moveNames, "move-names.json");
  await generateMappings("ability", abilityNames, "ability-names.json");
  await generateMappings("item", itemNames, "item-names.json");

  console.log("\nAll done!");
}

main().catch(console.error);
