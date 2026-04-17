/**
 * @smogon/calc Gen 0 (Champions) を正として、data/champions/ 配下に以下の JSON を生成する。
 *
 * - pokemon.json
 * - abilities.json
 * - items.json
 * - moves.json
 * - learnsets.json
 * - natures.json
 * - types.json
 * - conditions.json
 *
 * 生成ロジック:
 * - 各エントリの存在・計算用フィールドは @smogon/calc Gen 0 を正とする
 *   （species / abilities / items / moves / natures / types）
 * - @smogon/calc が持たない補完情報（desc / accuracy / pp / target / flags）は
 *   @pkmn/data Gen 9 base から取得
 * - @pkmn/data に無い desc/shortDesc（Champions 固有の ability など）は
 *   外部攻略データの base-text TypeScript ソースから補完
 * - Champions 固有のオーバーライド（basePower / accuracy / pp 等）は
 *   外部攻略データ mod の TypeScript ソースを静的パースして適用
 * - learnset は外部攻略データ mod からパースする
 * - nameJa は既存 JSON から保持する（既存エントリになければ null のまま）
 *
 * 前提: fetch-champions-data.ts 実行後に /tmp/champions-raw/ に
 *       mod の *.ts および base-text-*.ts が存在すること。
 *
 * 使い方: npx tsx scripts/generate-champions-data.ts
 */

import { Generations } from "@smogon/calc";
import type {
  Ability as CalcAbility,
  Item as CalcItem,
  Move as CalcMove,
  MoveCategory,
  MoveTarget,
  Nature,
  Specie,
  StatID,
  Type,
  TypeName,
} from "@smogon/calc/dist/data/interface";
import { Dex } from "@pkmn/dex";
import { Generations as PkmnGenerations } from "@pkmn/data";
import type { Ability, Item, Move } from "@pkmn/dex-types";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ===== 定数 =====

const CHAMPIONS_GEN_NUM = 0 as const;
const PKMN_BASE_GEN_NUM = 9 as const;
const CHAMPIONS_RAW_DIR = "/tmp/champions-raw";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(SCRIPT_DIR, "../data/champions");
const INDENT_SPACES = 2;
const NO_ABILITY_ID = "noability";
const DEFAULT_MOVE_TARGET: MoveTarget = "normal";
const DEFAULT_ACCURACY: number | true = true;
const DEFAULT_PP = 0;
const TYPE_NAME_UNKNOWN = "???" as const;

// ===== 出力先ファイル名 =====

const POKEMON_FILE = "pokemon.json";
const ABILITIES_FILE = "abilities.json";
const ITEMS_FILE = "items.json";
const MOVES_FILE = "moves.json";
const LEARNSETS_FILE = "learnsets.json";
const NATURES_FILE = "natures.json";
const TYPES_FILE = "types.json";
const CONDITIONS_FILE = "conditions.json";

// ===== 出力データの型定義 =====

interface BaseStats {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

interface PokemonEntry {
  id: string;
  name: string;
  nameJa: string | null;
  types: string[];
  baseStats: BaseStats;
  ability: string | null;
  weightkg: number;
  baseSpecies: string | null;
  otherFormes: string[] | null;
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

interface NatureEntry {
  id: string;
  name: string;
  nameJa: string | null;
  plus: StatID | null;
  minus: StatID | null;
}

interface TypeEntry {
  id: string;
  name: string;
  nameJa: string;
}

interface ConditionEntry {
  id: string;
  name: string;
  nameJa: string;
}

interface Conditions {
  weather: ConditionEntry[];
  terrain: ConditionEntry[];
  status: ConditionEntry[];
  sideCondition: ConditionEntry[];
}

type LearnsetMap = Record<string, string[]>;

// ===== 補完データの型 =====

interface MoveOverride {
  basePower?: number;
  accuracy?: number | true;
  pp?: number;
}

interface TextEntry {
  name: string;
  desc: string;
  shortDesc: string;
}

// ===== ユーティリティ =====

function readRawFile(fileName: string): string {
  return readFileSync(resolve(CHAMPIONS_RAW_DIR, fileName), "utf-8");
}

function writeJsonFile(fileName: string, data: unknown): string {
  const outputPath = resolve(OUTPUT_DIR, fileName);
  writeFileSync(outputPath, JSON.stringify(data, null, INDENT_SPACES) + "\n");
  return outputPath;
}

// ===== 既存 JSON から nameJa を読み込む =====

/**
 * 既存の JSON を読み込み、英語名 → 日本語名 (nameJa) の Map を返す。
 * ファイルが存在しない/読めない場合は空の Map。
 *
 * 旧フォーマット ({ ja, en } 形式) と新フォーマット ({ name, nameJa } 形式) の
 * 両方に対応する。
 */
function loadExistingNameJaMap(fileName: string): Map<string, string> {
  const filePath = resolve(OUTPUT_DIR, fileName);
  const result = new Map<string, string>();
  try {
    const content = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) return result;
    for (const raw of parsed) {
      if (raw === null || typeof raw !== "object") continue;
      const entry = raw as Record<string, unknown>;
      // 新フォーマット: { name, nameJa }
      if (typeof entry.name === "string" && typeof entry.nameJa === "string") {
        result.set(entry.name, entry.nameJa);
        continue;
      }
      // 旧フォーマット: { en, ja }
      if (typeof entry.en === "string" && typeof entry.ja === "string") {
        result.set(entry.en, entry.ja);
      }
    }
  } catch {
    // 既存ファイルがないケース（初回生成）は空の Map を返す
  }
  return result;
}

// ===== 攻略 mod のパーサ =====

/**
 * mod ファイルの各トップレベル id (1 タブインデント) ごとにボディを切り出す。
 * 戻り値は id → ボディ文字列（エントリ内部の 2 タブ以上の本文）。
 */
function splitEntries(content: string): Map<string, string> {
  const result = new Map<string, string>();
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
    result.set(id, bodyLines.join("\n"));
  }
  return result;
}

function parseNumberField(field: string, body: string): number | undefined {
  const pattern = new RegExp(`^\\t\\t${field}:\\s*(\\d+),?\\s*$`, "m");
  const match = body.match(pattern);
  return match ? Number(match[1]) : undefined;
}

/**
 * ボディ内から `\t\taccuracy: true,` または `\t\taccuracy: 95,` を取り出す。
 */
function parseAccuracy(body: string): number | true | undefined {
  if (/^\t\taccuracy:\s*true,?\s*$/m.test(body)) return true;
  const numMatch = body.match(/^\t\taccuracy:\s*(\d+),?\s*$/m);
  if (numMatch) return Number(numMatch[1]);
  return undefined;
}

/**
 * mod の moves.ts から各技の override（basePower / accuracy / pp）を抽出する。
 */
function parseMoveOverrides(): Map<string, MoveOverride> {
  const entries = splitEntries(readRawFile("moves.ts"));
  const result = new Map<string, MoveOverride>();
  for (const [id, body] of entries) {
    const override: MoveOverride = {};
    const accuracy = parseAccuracy(body);
    if (accuracy !== undefined) override.accuracy = accuracy;
    const pp = parseNumberField("pp", body);
    if (pp !== undefined) override.pp = pp;
    const basePower = parseNumberField("basePower", body);
    if (basePower !== undefined) override.basePower = basePower;
    result.set(id, override);
  }
  return result;
}

/**
 * ボディ内から `\t\t{field}: "..."` という形のトップレベル string 値を取り出す。
 * 世代別オーバーライド (gen6: {...}) のネストは正規表現のインデント指定で除外される。
 */
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
 * base-text ファイル (text/{abilities,items,moves}.ts) をパースし、
 * id → { name, desc, shortDesc } のマップを返す。
 *
 * 世代別オーバーライド (gen6: {...}) を含むが、
 * トップレベル (2 タブインデント) の name/desc/shortDesc のみを取る。
 */
function parseTextFile(fileName: string): Map<string, TextEntry> {
  const entries = splitEntries(readRawFile(fileName));
  const result = new Map<string, TextEntry>();
  for (const [id, body] of entries) {
    const name = matchTopLevelString(body, "name") ?? id;
    const desc = matchTopLevelString(body, "desc") ?? "";
    const shortDesc = matchTopLevelString(body, "shortDesc") ?? "";
    result.set(id, { name, desc, shortDesc });
  }
  return result;
}

/**
 * 攻略 mod の learnsets.ts からポケモンごとの技 ID 配列をパースする。
 */
function parseLearnsets(): LearnsetMap {
  const content = readRawFile("learnsets.ts");
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

    result[speciesId] = [...new Set(moveIds)].sort();
    i++;
  }
  return result;
}

// ===== @pkmn/data 側のインデックス（id → エントリ） =====

interface PkmnIndex {
  abilities: Map<string, Ability>;
  items: Map<string, Item>;
  moves: Map<string, Move>;
}

function buildPkmnIndex(): PkmnIndex {
  // exists = () => true にすることで isNonstandard === "Past" のエントリも列挙される
  const gens = new PkmnGenerations(Dex, () => true);
  const pkmnGen = gens.get(PKMN_BASE_GEN_NUM);

  const abilities = new Map<string, Ability>();
  for (const ability of pkmnGen.abilities) abilities.set(ability.id, ability);

  const items = new Map<string, Item>();
  for (const item of pkmnGen.items) items.set(item.id, item);

  const moves = new Map<string, Move>();
  for (const move of pkmnGen.moves) moves.set(move.id, move);

  return { abilities, items, moves };
}

// ===== エントリ構築 =====

function extractMegaInfo(item: CalcItem): {
  megaStone: string | null;
  megaEvolves: string | null;
} {
  if (!item.megaStone) return { megaStone: null, megaEvolves: null };
  const entries = Object.entries(item.megaStone);
  if (entries.length === 0) return { megaStone: null, megaEvolves: null };
  const [megaEvolves, megaStoneForme] = entries[0];
  return { megaStone: megaStoneForme, megaEvolves };
}

function buildPokemonEntries(
  species: Iterable<Specie>,
  enToJa: Map<string, string>
): PokemonEntry[] {
  const entries: PokemonEntry[] = [];
  for (const specie of species) {
    entries.push({
      id: specie.id,
      name: specie.name,
      nameJa: enToJa.get(specie.name) ?? null,
      types: [...specie.types],
      baseStats: {
        hp: specie.baseStats.hp,
        atk: specie.baseStats.atk,
        def: specie.baseStats.def,
        spa: specie.baseStats.spa,
        spd: specie.baseStats.spd,
        spe: specie.baseStats.spe,
      },
      ability: specie.abilities?.[0] ? specie.abilities[0] : null,
      weightkg: specie.weightkg,
      baseSpecies: specie.baseSpecies ?? null,
      otherFormes: specie.otherFormes ? [...specie.otherFormes] : null,
    });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

function buildAbilityEntries(
  abilities: Iterable<CalcAbility>,
  pkmnAbilities: Map<string, Ability>,
  textEntries: Map<string, TextEntry>,
  enToJa: Map<string, string>
): AbilityEntry[] {
  const entries: AbilityEntry[] = [];
  for (const ability of abilities) {
    if (ability.id === NO_ABILITY_ID) continue;
    const pkmn = pkmnAbilities.get(ability.id);
    const text = textEntries.get(ability.id);
    const shortDesc = pkmn?.shortDesc || text?.shortDesc || "";
    const desc = pkmn?.desc || text?.desc || shortDesc;
    entries.push({
      id: ability.id,
      name: ability.name,
      nameJa: enToJa.get(ability.name) ?? null,
      desc,
      shortDesc,
    });
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));
  return entries;
}

function buildItemEntries(
  items: Iterable<CalcItem>,
  pkmnItems: Map<string, Item>,
  textEntries: Map<string, TextEntry>,
  enToJa: Map<string, string>
): ItemEntry[] {
  const entries: ItemEntry[] = [];
  for (const item of items) {
    const { megaStone, megaEvolves } = extractMegaInfo(item);
    const pkmn = pkmnItems.get(item.id);
    const text = textEntries.get(item.id);
    const shortDesc = pkmn?.shortDesc || text?.shortDesc || "";
    const desc = pkmn?.desc || text?.desc || shortDesc;
    entries.push({
      id: item.id,
      name: item.name,
      nameJa: enToJa.get(item.name) ?? null,
      desc,
      shortDesc,
      megaStone,
      megaEvolves,
    });
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));
  return entries;
}

/**
 * @pkmn/data Move の flags (Record<string, 1 | 0>) から有効なフラグ名だけを配列化する。
 */
function pkmnFlagsToArray(flags: Move["flags"] | undefined): string[] {
  if (!flags) return [];
  return Object.keys(flags)
    .filter((key) => flags[key as keyof typeof flags])
    .sort();
}

function buildMoveEntries(
  moves: Iterable<CalcMove>,
  pkmnMoves: Map<string, Move>,
  moveOverrides: Map<string, MoveOverride>,
  textEntries: Map<string, TextEntry>,
  enToJa: Map<string, string>
): MoveEntry[] {
  const entries: MoveEntry[] = [];
  for (const move of moves) {
    const pkmn = pkmnMoves.get(move.id);
    const text = textEntries.get(move.id);
    const override = moveOverrides.get(move.id);
    // @smogon/calc は Gen >= 4 だと category 未指定を Status にフォールバックするため、
    // Gen 0 でも同じ扱いにする。
    const category = move.category ?? "Status";
    // basePower / accuracy / pp は Champions override → @pkmn/data → @smogon/calc の優先順で解決。
    const basePower = override?.basePower ?? move.basePower;
    const accuracy: number | true =
      override?.accuracy ?? pkmn?.accuracy ?? DEFAULT_ACCURACY;
    const pp = override?.pp ?? pkmn?.pp ?? DEFAULT_PP;
    // flags は @pkmn/data が網羅的なのでそちらを使う（metronome / snatch / mirror など）。
    const flags = pkmnFlagsToArray(pkmn?.flags);
    const shortDesc = pkmn?.shortDesc || text?.shortDesc || "";
    const desc = pkmn?.desc || text?.desc || shortDesc;
    entries.push({
      id: move.id,
      name: move.name,
      nameJa: enToJa.get(move.name) ?? null,
      type: move.type,
      category,
      basePower,
      accuracy,
      pp,
      priority: move.priority ?? 0,
      target: move.target ?? pkmn?.target ?? DEFAULT_MOVE_TARGET,
      flags,
      desc,
      shortDesc,
    });
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));
  return entries;
}

/**
 * @smogon/calc Gen 0 に存在する species のみに絞り込み、
 * 技 ID も Champions 内の有効な技に限定した上で id 昇順で返す。
 *
 * mod の learnset には Champions 外 (例: Aegislash) のエントリや
 * Champions で使えない技が含まれうるため、両方を除外する。
 */
function sortAndFilterLearnsets(
  learnsets: LearnsetMap,
  validSpeciesIds: ReadonlySet<string>,
  validMoveIds: ReadonlySet<string>
): LearnsetMap {
  const sortedKeys = Object.keys(learnsets)
    .filter((key) => validSpeciesIds.has(key))
    .sort();
  const result: LearnsetMap = {};
  for (const key of sortedKeys) {
    result[key] = learnsets[key].filter((moveId) => validMoveIds.has(moveId));
  }
  return result;
}

function buildNatureEntries(
  natures: Iterable<Nature>,
  enToJa: Map<string, string>
): NatureEntry[] {
  const entries: NatureEntry[] = [];
  for (const nature of natures) {
    // Bashful / Hardy / Docile / Quirky / Serious は plus === minus となっており補正なし
    const hasBoost = nature.plus !== nature.minus;
    entries.push({
      id: nature.id,
      name: nature.name,
      nameJa: enToJa.get(nature.name) ?? null,
      plus: hasBoost ? (nature.plus ?? null) : null,
      minus: hasBoost ? (nature.minus ?? null) : null,
    });
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));
  return entries;
}

// ===== Type / Condition マッピング =====

const TYPE_JA_MAP: Readonly<Record<string, string>> = {
  Normal: "ノーマル",
  Fire: "ほのお",
  Water: "みず",
  Electric: "でんき",
  Grass: "くさ",
  Ice: "こおり",
  Fighting: "かくとう",
  Poison: "どく",
  Ground: "じめん",
  Flying: "ひこう",
  Psychic: "エスパー",
  Bug: "むし",
  Rock: "いわ",
  Ghost: "ゴースト",
  Dragon: "ドラゴン",
  Dark: "あく",
  Steel: "はがね",
  Fairy: "フェアリー",
};

function buildTypeEntries(types: Iterable<Type>): TypeEntry[] {
  const entries: TypeEntry[] = [];
  for (const type of types) {
    // '???' (無属性) は MCP ツールの対象外として除外
    if ((type.name as string) === TYPE_NAME_UNKNOWN) continue;
    const nameJa = TYPE_JA_MAP[type.name];
    if (!nameJa) {
      throw new Error(`Missing Japanese name for type: ${type.name}`);
    }
    entries.push({
      id: type.id,
      name: type.name,
      nameJa,
    });
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));
  return entries;
}

// 天気・フィールド・状態異常・サイド効果の日本語マッピング
const CONDITIONS: Conditions = {
  weather: [
    { id: "sun", name: "Sun", nameJa: "はれ" },
    { id: "rain", name: "Rain", nameJa: "あめ" },
    { id: "sand", name: "Sand", nameJa: "すなあらし" },
    { id: "hail", name: "Hail", nameJa: "あられ" },
    { id: "snow", name: "Snow", nameJa: "ゆき" },
    { id: "harshsunshine", name: "Harsh Sunshine", nameJa: "おおひでり" },
    { id: "heavyrain", name: "Heavy Rain", nameJa: "おおあめ" },
    { id: "strongwinds", name: "Strong Winds", nameJa: "らんきりゅう" },
  ],
  terrain: [
    { id: "electric", name: "Electric", nameJa: "エレキフィールド" },
    { id: "grassy", name: "Grassy", nameJa: "グラスフィールド" },
    { id: "psychic", name: "Psychic", nameJa: "サイコフィールド" },
    { id: "misty", name: "Misty", nameJa: "ミストフィールド" },
  ],
  status: [
    { id: "slp", name: "slp", nameJa: "ねむり" },
    { id: "psn", name: "psn", nameJa: "どく" },
    { id: "brn", name: "brn", nameJa: "やけど" },
    { id: "frz", name: "frz", nameJa: "こおり" },
    { id: "par", name: "par", nameJa: "まひ" },
    { id: "tox", name: "tox", nameJa: "もうどく" },
  ],
  sideCondition: [
    { id: "reflect", name: "Reflect", nameJa: "リフレクター" },
    { id: "lightscreen", name: "Light Screen", nameJa: "ひかりのかべ" },
    { id: "auroraveil", name: "Aurora Veil", nameJa: "オーロラベール" },
    { id: "tailwind", name: "Tailwind", nameJa: "おいかぜ" },
  ],
};

// ===== メイン =====

async function main(): Promise<void> {
  const gen = Generations.get(CHAMPIONS_GEN_NUM);

  console.log("Building @pkmn/data index (gen 9 base)...");
  const pkmnIndex = buildPkmnIndex();
  console.log(
    `  abilities: ${pkmnIndex.abilities.size}, items: ${pkmnIndex.items.size}, moves: ${pkmnIndex.moves.size}`
  );

  console.log("\nParsing Champions mod overrides and base-text...");
  const moveOverrides = parseMoveOverrides();
  const learnsets = parseLearnsets();
  const abilityText = parseTextFile("base-text-abilities.ts");
  const itemText = parseTextFile("base-text-items.ts");
  const moveText = parseTextFile("base-text-moves.ts");
  console.log(
    `  moves override: ${moveOverrides.size}, learnsets species: ${Object.keys(learnsets).length}`
  );
  console.log(
    `  base-text abilities: ${abilityText.size}, items: ${itemText.size}, moves: ${moveText.size}`
  );

  console.log("\nLoading existing Japanese name mappings...");
  const pokemonEnToJa = loadExistingNameJaMap(POKEMON_FILE);
  const abilityEnToJa = loadExistingNameJaMap(ABILITIES_FILE);
  const itemEnToJa = loadExistingNameJaMap(ITEMS_FILE);
  const moveEnToJa = loadExistingNameJaMap(MOVES_FILE);
  const natureEnToJa = loadExistingNameJaMap(NATURES_FILE);
  console.log(
    `  pokemon: ${pokemonEnToJa.size}, abilities: ${abilityEnToJa.size}, items: ${itemEnToJa.size}, moves: ${moveEnToJa.size}, natures: ${natureEnToJa.size}`
  );

  console.log("\nBuilding entries...");
  const pokemonEntries = buildPokemonEntries(gen.species, pokemonEnToJa);
  const abilityEntries = buildAbilityEntries(
    gen.abilities,
    pkmnIndex.abilities,
    abilityText,
    abilityEnToJa
  );
  const itemEntries = buildItemEntries(
    gen.items,
    pkmnIndex.items,
    itemText,
    itemEnToJa
  );
  const moveEntries = buildMoveEntries(
    gen.moves,
    pkmnIndex.moves,
    moveOverrides,
    moveText,
    moveEnToJa
  );
  const natureEntries = buildNatureEntries(gen.natures, natureEnToJa);
  const typeEntries = buildTypeEntries(gen.types);
  const validSpeciesIds = new Set(pokemonEntries.map((e) => e.id));
  const validMoveIds = new Set(moveEntries.map((e) => e.id));
  const sortedLearnsets = sortAndFilterLearnsets(
    learnsets,
    validSpeciesIds,
    validMoveIds
  );

  console.log("\nWriting JSON files...");
  const writes: [string, { length?: number; count?: number }][] = [
    [
      writeJsonFile(POKEMON_FILE, pokemonEntries),
      { length: pokemonEntries.length },
    ],
    [
      writeJsonFile(ABILITIES_FILE, abilityEntries),
      { length: abilityEntries.length },
    ],
    [writeJsonFile(ITEMS_FILE, itemEntries), { length: itemEntries.length }],
    [writeJsonFile(MOVES_FILE, moveEntries), { length: moveEntries.length }],
    [
      writeJsonFile(LEARNSETS_FILE, sortedLearnsets),
      { count: Object.keys(sortedLearnsets).length },
    ],
    [
      writeJsonFile(NATURES_FILE, natureEntries),
      { length: natureEntries.length },
    ],
    [writeJsonFile(TYPES_FILE, typeEntries), { length: typeEntries.length }],
    [writeJsonFile(CONDITIONS_FILE, CONDITIONS), { count: 4 }],
  ];

  for (const [path, stats] of writes) {
    console.log(`  ${path} ${JSON.stringify(stats)}`);
  }

  const pokemonWithJa = pokemonEntries.filter((e) => e.nameJa !== null).length;
  const abilitiesWithJa = abilityEntries.filter(
    (e) => e.nameJa !== null
  ).length;
  const itemsWithJa = itemEntries.filter((e) => e.nameJa !== null).length;
  const movesWithJa = moveEntries.filter((e) => e.nameJa !== null).length;
  const naturesWithJa = natureEntries.filter((e) => e.nameJa !== null).length;

  console.log("\nJapanese name coverage:");
  console.log(`  pokemon: ${pokemonWithJa}/${pokemonEntries.length}`);
  console.log(`  abilities: ${abilitiesWithJa}/${abilityEntries.length}`);
  console.log(`  items: ${itemsWithJa}/${itemEntries.length}`);
  console.log(`  moves: ${movesWithJa}/${moveEntries.length}`);
  console.log(`  natures: ${naturesWithJa}/${natureEntries.length}`);

  console.log("\nAll done!");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
