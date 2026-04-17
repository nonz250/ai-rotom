/**
 * pokemon-showdown の Champions mod データと @pkmn/data の gen 9 ベースデータを合成し、
 * 以下の JSON ファイルを packages/mcp-server/data/ 配下に出力する。
 *
 * - champions-abilities.json
 * - champions-items.json
 * - champions-moves.json
 * - champions-learnsets.json
 *
 * 合成ロジック:
 * - gen 9 ベース (@pkmn/data) の全エントリをスタート地点とする
 * - Champions mod の override を適用 (isNonstandard, basePower, accuracy, pp 等)
 * - Champions mod で新規追加/復活された新エントリは、gen9 ベースにない場合
 *   pokemon-showdown 本体の text ファイルから name/desc を補完
 * - 最終的な isNonstandard が null (= 使える) となるもののみ出力。
 *   "Past" / "Future" 等のフラグが付いているものは Champions 環境で使えないとして除外する。
 *
 * 前提: fetch-champions-data.ts 実行後に /tmp/champions-raw/ に
 *       *.ts および base-text-*.ts が存在すること。
 *
 * 使い方: npx tsx packages/mcp-server/scripts/generate-champions-data.ts
 */

import type {
  Ability,
  Item,
  Move,
  MoveCategory,
  MoveTarget,
  Nonstandard,
  TypeName,
} from "@pkmn/dex-types";
import { Generations } from "@pkmn/data";
import { Dex } from "@pkmn/dex";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const CHAMPIONS_RAW_DIR = "/tmp/champions-raw";
const OUTPUT_DIR = resolve(import.meta.dirname, "../data");
const TARGET_GENERATION = 9;
const NONSTANDARD_PAST: Nonstandard = "Past";
const INDENT_SPACES = 2;
const NO_ABILITY_ID = "noability";

type IsNonstandardOverride = Nonstandard | null | undefined;

interface AbilityOverride {
  isNonstandard?: IsNonstandardOverride;
}

interface ItemOverride {
  isNonstandard?: IsNonstandardOverride;
}

interface MoveOverride {
  isNonstandard?: IsNonstandardOverride;
  basePower?: number;
  accuracy?: number | true;
  pp?: number;
}

interface AbilityEntry {
  id: string;
  name: string;
  nameJa: string | null;
  desc: string;
  shortDesc: string;
}

interface ItemEntry {
  id: string;
  name: string;
  nameJa: string | null;
  desc: string;
  shortDesc: string;
  megaStone: string | null;
  megaEvolves: string | null;
}

interface MoveEntry {
  id: string;
  name: string;
  nameJa: string | null;
  type: TypeName;
  category: MoveCategory;
  basePower: number;
  accuracy: number | true;
  pp: number;
  priority: number;
  target: MoveTarget;
  flags: string[];
  desc: string;
  shortDesc: string;
}

interface TextEntry {
  name: string;
  desc: string;
  shortDesc: string;
}

type LearnsetMap = Record<string, string[]>;

/** 既存の champions-*.json ファイル名 */
const CHAMPIONS_ABILITIES_FILE = "champions-abilities.json";
const CHAMPIONS_ITEMS_FILE = "champions-items.json";
const CHAMPIONS_MOVES_FILE = "champions-moves.json";

/**
 * 既存の champions-*.json を読み込み、英語名 → 日本語名 (nameJa) の Map を返す。
 * 初回生成時などファイルが存在しない場合は空の Map を返す。
 *
 * 再生成時に既存の nameJa を保持するために使用する。
 */
function loadExistingNameJaMap(fileName: string): Map<string, string> {
  const filePath = resolve(OUTPUT_DIR, fileName);
  const result = new Map<string, string>();
  try {
    const content = readFileSync(filePath, "utf-8");
    const entries = JSON.parse(content) as {
      name: string;
      nameJa: string | null;
    }[];
    for (const entry of entries) {
      if (entry.nameJa !== null) {
        result.set(entry.name, entry.nameJa);
      }
    }
  } catch {
    // 既存ファイルが無い、または読めない場合は空の Map を返す（初回生成想定）
  }
  return result;
}

/**
 * Champions mod の TS ファイルから各エントリの id とフィールドの static 値のみを抽出する。
 * 動的 import は `inherit` や関数定義を含むため避け、行ベースで手動パースする。
 */
function parseStaticOverrides<T>(
  fileContent: string,
  fieldParsers: { [K in keyof T]: (raw: string) => T[K] | undefined }
): Map<string, T> {
  const result = new Map<string, T>();
  const lines = fileContent.split("\n");
  let i = 0;
  while (i < lines.length) {
    const entryMatch = lines[i].match(/^\t([a-z0-9]+):\s*\{\s*$/);
    if (!entryMatch) {
      i++;
      continue;
    }
    const id = entryMatch[1];
    const bodyLines: string[] = [];
    let depth = 1;
    i++;
    while (i < lines.length && depth > 0) {
      const line = lines[i];
      if (depth === 1 && /^\t\},?$/.test(line)) {
        depth = 0;
        i++;
        break;
      }
      for (const ch of line) {
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
      }
      bodyLines.push(line);
      i++;
    }

    const body = bodyLines.join("\n");
    const parsed = {} as T;
    for (const key of Object.keys(fieldParsers) as (keyof T)[]) {
      const value = fieldParsers[key](body);
      if (value !== undefined) {
        (parsed as Record<string, unknown>)[key as string] = value;
      }
    }
    result.set(id, parsed);
  }

  return result;
}

function parseIsNonstandard(body: string): IsNonstandardOverride {
  if (/^\t\tisNonstandard:\s*null,?\s*$/m.test(body)) return null;
  if (/^\t\tisNonstandard:\s*"Past",?\s*$/m.test(body)) return NONSTANDARD_PAST;
  return undefined;
}

function parseNumberField(field: string, body: string): number | undefined {
  const pattern = new RegExp(`^\\t\\t${field}:\\s*(\\d+),?\\s*$`, "m");
  const match = body.match(pattern);
  return match ? Number(match[1]) : undefined;
}

function parseAccuracy(body: string): number | true | undefined {
  if (/^\t\taccuracy:\s*true,?\s*$/m.test(body)) return true;
  const numMatch = body.match(/^\t\taccuracy:\s*(\d+),?\s*$/m);
  if (numMatch) return Number(numMatch[1]);
  return undefined;
}

function readChampionsFile(fileName: string): string {
  return readFileSync(resolve(CHAMPIONS_RAW_DIR, fileName), "utf-8");
}

function parseAbilityOverrides(): Map<string, AbilityOverride> {
  return parseStaticOverrides<AbilityOverride>(
    readChampionsFile("abilities.ts"),
    {
      isNonstandard: parseIsNonstandard,
    }
  );
}

function parseItemOverrides(): Map<string, ItemOverride> {
  return parseStaticOverrides<ItemOverride>(readChampionsFile("items.ts"), {
    isNonstandard: parseIsNonstandard,
  });
}

function parseMoveOverrides(): Map<string, MoveOverride> {
  return parseStaticOverrides<MoveOverride>(readChampionsFile("moves.ts"), {
    isNonstandard: parseIsNonstandard,
    basePower: (body) => parseNumberField("basePower", body),
    accuracy: parseAccuracy,
    pp: (body) => parseNumberField("pp", body),
  });
}

/**
 * pokemon-showdown 本体の data/text/{abilities,items,moves}.ts をパースして、
 * id => { name, desc, shortDesc } のマップを返す。
 * text ファイルの各エントリは 1 階層で、name/desc/shortDesc が直値の文字列。
 */
function parseTextFile(fileName: string): Map<string, TextEntry> {
  const content = readChampionsFile(fileName);
  const result = new Map<string, TextEntry>();

  const lines = content.split("\n");
  let i = 0;
  while (i < lines.length) {
    const entryMatch = lines[i].match(/^\t([a-z0-9]+):\s*\{\s*$/);
    if (!entryMatch) {
      i++;
      continue;
    }
    const id = entryMatch[1];
    const bodyLines: string[] = [];
    let depth = 1;
    i++;
    while (i < lines.length && depth > 0) {
      const line = lines[i];
      if (depth === 1 && /^\t\},?$/.test(line)) {
        depth = 0;
        i++;
        break;
      }
      for (const ch of line) {
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
      }
      bodyLines.push(line);
      i++;
    }
    const body = bodyLines.join("\n");

    // トップレベル (インデント 2 タブ) の name / desc / shortDesc のみ抽出。
    // 世代別オーバーライド (gen6: { ... }) の中はインデントが深いため正規表現で除外される。
    const name = matchTopLevelString(body, "name") ?? id;
    const desc = matchTopLevelString(body, "desc") ?? "";
    const shortDesc = matchTopLevelString(body, "shortDesc") ?? "";
    result.set(id, { name, desc, shortDesc });
  }
  return result;
}

function matchTopLevelString(body: string, field: string): string | undefined {
  const pattern = new RegExp(
    `^\\t\\t${field}:\\s*"((?:[^"\\\\]|\\\\.)*)",?\\s*$`,
    "m"
  );
  const match = body.match(pattern);
  if (!match) return undefined;
  return unescapeTsStringLiteral(match[1]);
}

function unescapeTsStringLiteral(literal: string): string {
  return literal
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t");
}

/**
 * Champions mod の learnsets.ts をパースして、ポケモンごとの技 ID 配列を返す。
 */
function parseLearnsets(): LearnsetMap {
  const content = readChampionsFile("learnsets.ts");
  const result: LearnsetMap = {};
  const lines = content.split("\n");

  let i = 0;
  while (i < lines.length) {
    const speciesMatch = lines[i].match(/^\t([a-z0-9]+):\s*\{\s*$/);
    if (!speciesMatch) {
      i++;
      continue;
    }
    const speciesId = speciesMatch[1];
    i++;

    const moveIds: string[] = [];
    while (i < lines.length && !/^\t\},?\s*$/.test(lines[i])) {
      const learnsetStart = lines[i].match(/^\t\tlearnset:\s*\{\s*$/);
      if (learnsetStart) {
        i++;
        while (i < lines.length && !/^\t\t\},?\s*$/.test(lines[i])) {
          const moveMatch = lines[i].match(/^\t\t\t([a-z0-9]+):\s*\[/);
          if (moveMatch) {
            moveIds.push(moveMatch[1]);
          }
          i++;
        }
      }
      i++;
    }

    result[speciesId] = moveIds.sort();
    i++;
  }

  return result;
}

/**
 * Champions mod の isNonstandard override を解決する。
 *
 * - override で `isNonstandard: "Past"` と明示されていれば "Past"
 * - override で `isNonstandard: null` と明示されていれば null
 * - override 自体は存在するが isNonstandard 指定なし (basePower 等のみ変更) → null (使える)
 *   → Champions mod が何らかの上書きをしているエントリは使える前提と解釈
 * - override が全く存在しない → baseIsNonstandard をそのまま使う
 */
function resolveEffectiveNonstandard(
  baseIsNonstandard: Nonstandard | null | undefined,
  hasOverride: boolean,
  overrideValue: IsNonstandardOverride
): Nonstandard | null | undefined {
  if (!hasOverride) return baseIsNonstandard;
  if (overrideValue !== undefined) return overrideValue;
  return null;
}

/**
 * Champions で使えるかを判定する。
 * null (= 使える) 以外は "Past" / "Future" / "Unobtainable" 等いずれも使えないとして除外する。
 */
function isUsable(
  baseIsNonstandard: Nonstandard | null | undefined,
  override: { isNonstandard?: IsNonstandardOverride } | undefined
): boolean {
  const effective = resolveEffectiveNonstandard(
    baseIsNonstandard,
    override !== undefined,
    override?.isNonstandard
  );
  return effective === null || effective === undefined;
}

function buildAbilityEntries(
  abilities: Iterable<Ability>,
  overrides: Map<string, AbilityOverride>,
  textEntries: Map<string, TextEntry>,
  enToJa: Map<string, string>
): AbilityEntry[] {
  const entries: AbilityEntry[] = [];
  const seenIds = new Set<string>();

  for (const ability of abilities) {
    if (ability.id === NO_ABILITY_ID) continue;
    const override = overrides.get(ability.id);
    if (!isUsable(ability.isNonstandard, override)) continue;
    entries.push({
      id: ability.id,
      name: ability.name,
      nameJa: enToJa.get(ability.name) ?? null,
      desc: ability.desc ?? ability.shortDesc ?? "",
      shortDesc: ability.shortDesc ?? "",
    });
    seenIds.add(ability.id);
  }

  // gen9 ベースに存在しないが Champions mod で新規追加された特性を text から補完
  for (const [id, override] of overrides) {
    if (seenIds.has(id)) continue;
    if (override.isNonstandard === NONSTANDARD_PAST) continue;
    const text = textEntries.get(id);
    if (!text) continue;
    entries.push({
      id,
      name: text.name,
      nameJa: enToJa.get(text.name) ?? null,
      desc: text.desc || text.shortDesc,
      shortDesc: text.shortDesc,
    });
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));
  return entries;
}

function extractMegaInfo(item: Item): {
  megaStone: string | null;
  megaEvolves: string | null;
} {
  if (!item.megaStone) return { megaStone: null, megaEvolves: null };
  const entries = Object.entries(item.megaStone);
  if (entries.length === 0) return { megaStone: null, megaEvolves: null };
  const [megaEvolves, megaStoneForme] = entries[0];
  return { megaStone: megaStoneForme, megaEvolves };
}

function buildItemEntries(
  items: Iterable<Item>,
  overrides: Map<string, ItemOverride>,
  textEntries: Map<string, TextEntry>,
  enToJa: Map<string, string>
): ItemEntry[] {
  const entries: ItemEntry[] = [];
  const seenIds = new Set<string>();

  for (const item of items) {
    const override = overrides.get(item.id);
    if (!isUsable(item.isNonstandard, override)) continue;
    const { megaStone, megaEvolves } = extractMegaInfo(item);
    entries.push({
      id: item.id,
      name: item.name,
      nameJa: enToJa.get(item.name) ?? null,
      desc: item.desc ?? item.shortDesc ?? "",
      shortDesc: item.shortDesc ?? "",
      megaStone,
      megaEvolves,
    });
    seenIds.add(item.id);
  }

  for (const [id, override] of overrides) {
    if (seenIds.has(id)) continue;
    if (override.isNonstandard === NONSTANDARD_PAST) continue;
    const text = textEntries.get(id);
    if (!text) continue;
    entries.push({
      id,
      name: text.name,
      nameJa: enToJa.get(text.name) ?? null,
      desc: text.desc || text.shortDesc,
      shortDesc: text.shortDesc,
      megaStone: null,
      megaEvolves: null,
    });
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));
  return entries;
}

function flagKeysToArray(flags: Move["flags"]): string[] {
  if (!flags) return [];
  return Object.keys(flags)
    .filter((k) => flags[k as keyof typeof flags])
    .sort();
}

function buildMoveEntries(
  moves: Iterable<Move>,
  overrides: Map<string, MoveOverride>,
  textEntries: Map<string, TextEntry>,
  enToJa: Map<string, string>
): MoveEntry[] {
  const entries: MoveEntry[] = [];
  const seenIds = new Set<string>();

  for (const move of moves) {
    const override = overrides.get(move.id);
    if (!isUsable(move.isNonstandard, override)) continue;
    entries.push({
      id: move.id,
      name: move.name,
      nameJa: enToJa.get(move.name) ?? null,
      type: move.type,
      category: move.category,
      basePower: override?.basePower ?? move.basePower,
      accuracy: override?.accuracy ?? move.accuracy,
      pp: override?.pp ?? move.pp,
      priority: move.priority,
      target: move.target,
      flags: flagKeysToArray(move.flags),
      desc: move.desc ?? move.shortDesc ?? "",
      shortDesc: move.shortDesc ?? "",
    });
    seenIds.add(move.id);
  }

  // gen9 base に存在しないが Champions mod で新規追加された技は text から補完できないため警告のみ
  // (現状そのようなケースは観測されていない)
  for (const [id, override] of overrides) {
    if (seenIds.has(id)) continue;
    if (override.isNonstandard === NONSTANDARD_PAST) continue;
    const text = textEntries.get(id);
    if (!text) continue;
    console.warn(
      `  Warning: move "${id}" is enabled in Champions but no gen9 base data; skipping`
    );
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));
  return entries;
}

function sortLearnsets(learnsets: LearnsetMap): LearnsetMap {
  const sortedKeys = Object.keys(learnsets).sort();
  const result: LearnsetMap = {};
  for (const key of sortedKeys) {
    result[key] = learnsets[key];
  }
  return result;
}

function writeJsonFile(fileName: string, data: unknown): string {
  const outputPath = resolve(OUTPUT_DIR, fileName);
  writeFileSync(outputPath, JSON.stringify(data, null, INDENT_SPACES) + "\n");
  return outputPath;
}

async function main(): Promise<void> {
  // DEFAULT_EXISTS だと isNonstandard === "Past" のエントリが除外されるため、
  // 全て列挙できるように exists = () => true を指定する。
  const gens = new Generations(Dex, () => true);
  const gen = gens.get(TARGET_GENERATION);

  console.log("Parsing Champions mod overrides...");
  const abilityOverrides = parseAbilityOverrides();
  const itemOverrides = parseItemOverrides();
  const moveOverrides = parseMoveOverrides();
  const learnsets = parseLearnsets();
  console.log(
    `  abilities: ${abilityOverrides.size}, items: ${itemOverrides.size}, moves: ${moveOverrides.size}, learnsets: ${Object.keys(learnsets).length}`
  );

  console.log("\nParsing base text files for supplemental descriptions...");
  const abilityText = parseTextFile("base-text-abilities.ts");
  const itemText = parseTextFile("base-text-items.ts");
  const moveText = parseTextFile("base-text-moves.ts");
  console.log(
    `  abilities: ${abilityText.size}, items: ${itemText.size}, moves: ${moveText.size}`
  );

  console.log("\nLoading existing Japanese name mappings...");
  const abilityEnToJa = loadExistingNameJaMap(CHAMPIONS_ABILITIES_FILE);
  const itemEnToJa = loadExistingNameJaMap(CHAMPIONS_ITEMS_FILE);
  const moveEnToJa = loadExistingNameJaMap(CHAMPIONS_MOVES_FILE);
  console.log(
    `  abilities: ${abilityEnToJa.size}, items: ${itemEnToJa.size}, moves: ${moveEnToJa.size}`
  );

  console.log("\nBuilding merged data...");
  const abilityEntries = buildAbilityEntries(
    gen.abilities,
    abilityOverrides,
    abilityText,
    abilityEnToJa
  );
  const itemEntries = buildItemEntries(
    gen.items,
    itemOverrides,
    itemText,
    itemEnToJa
  );
  const moveEntries = buildMoveEntries(
    gen.moves,
    moveOverrides,
    moveText,
    moveEnToJa
  );
  const sortedLearnsets = sortLearnsets(learnsets);

  console.log("\nWriting JSON files...");
  const abilityPath = writeJsonFile(
    "champions-abilities.json",
    abilityEntries
  );
  const itemPath = writeJsonFile("champions-items.json", itemEntries);
  const movePath = writeJsonFile("champions-moves.json", moveEntries);
  const learnsetPath = writeJsonFile(
    "champions-learnsets.json",
    sortedLearnsets
  );

  console.log(`  ${abilityPath} (abilities: ${abilityEntries.length})`);
  console.log(`  ${itemPath} (items: ${itemEntries.length})`);
  console.log(`  ${movePath} (moves: ${moveEntries.length})`);
  console.log(
    `  ${learnsetPath} (species: ${Object.keys(sortedLearnsets).length})`
  );

  console.log("\nAll done!");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
