import { calculate, Generations, Pokemon, Move, Field } from "@smogon/calc";
import type { NameResolver } from "@ai-rotom/shared";
import { pokemonById, toDataId, type PokemonEntry } from "../data-store.js";

const CHAMPIONS_GEN_NUM = 0;
const DEFAULT_NATURE_EN = "Serious";

/**
 * pokemon.json のエントリから @smogon/calc の overrides オプション用オブジェクトを作る。
 * @smogon/calc の Specie 型は types を文字列 union のタプル ([TypeName] | [TypeName, TypeName]) として
 * 厳密に定義しているが、pokemon.json 側は string[] で保持するため、呼び出し側でキャストする。
 */
function buildSpeciesOverrides(
  entry: PokemonEntry,
): {
  // @smogon/calc の Specie.types / baseStats に相当する形へキャストを委ねるため unknown にする
  types: unknown;
  baseStats: PokemonEntry["baseStats"];
} {
  return {
    types: entry.types,
    baseStats: entry.baseStats,
  };
}

export interface StatsInput {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

export interface PokemonInput {
  name: string;
  nature?: string;
  evs?: Partial<StatsInput>;
  ability?: string;
  item?: string;
  boosts?: Partial<StatsInput>;
  status?: string;
}

export interface ConditionsInput {
  weather?: string;
  terrain?: string;
  isReflect?: boolean;
  isLightScreen?: boolean;
  isAuroraVeil?: boolean;
  isCriticalHit?: boolean;
}

export interface DamageCalcInput {
  attacker: PokemonInput;
  defender: PokemonInput;
  moveName: string;
  conditions?: ConditionsInput;
}

export interface AllMovesCalcInput {
  attacker: PokemonInput;
  defender: PokemonInput;
  conditions?: ConditionsInput;
}

export interface DamageCalcResult {
  attacker: string;
  defender: string;
  move: string;
  damage: number[];
  min: number;
  max: number;
  minPercent: number;
  maxPercent: number;
  koChance: string;
  description: string;
}

interface NameResolvers {
  pokemon: NameResolver;
  move: NameResolver;
  ability: NameResolver;
  item: NameResolver;
  nature: NameResolver;
}

function resolveNameWithFallback(
  resolver: NameResolver,
  name: string,
  label: string,
): string {
  const englishName = resolver.toEnglish(name);
  if (englishName !== undefined) {
    return englishName;
  }

  if (resolver.hasEnglishName(name)) {
    return name;
  }

  const suggestions = resolver.suggestSimilar(name);
  const suggestionMessage =
    suggestions.length > 0
      ? ` もしかして: ${suggestions.join(", ")}`
      : "";
  throw new Error(
    `${label}「${name}」が見つかりません。${suggestionMessage}`,
  );
}

function resolveOptionalName(
  resolver: NameResolver,
  name: string | undefined,
  label: string,
): string | undefined {
  if (name === undefined) {
    return undefined;
  }
  return resolveNameWithFallback(resolver, name, label);
}

function toSmogonEvs(
  evs: Partial<StatsInput> | undefined,
): Partial<{ hp: number; atk: number; def: number; spa: number; spd: number; spe: number }> {
  if (evs === undefined) {
    return {};
  }
  return { ...evs };
}

function toSmogonBoosts(
  boosts: Partial<StatsInput> | undefined,
): Partial<{ hp: number; atk: number; def: number; spa: number; spd: number; spe: number }> {
  if (boosts === undefined) {
    return {};
  }
  return { ...boosts };
}

const PERCENT_MULTIPLIER = 100;
const PERCENT_DECIMAL_PRECISION = 10;

function flattenDamage(damage: number | number[] | number[][]): number[] {
  if (typeof damage === "number") {
    return [damage];
  }
  if (Array.isArray(damage) && damage.length > 0 && Array.isArray(damage[0])) {
    return (damage as number[][]).flat();
  }
  return damage as number[];
}

type StatusName = "" | "psn" | "tox" | "brn" | "par" | "slp" | "frz";

/**
 * PokemonInput から @smogon/calc の Pokemon コンストラクタに渡す options を組み立てる。
 *
 * pokemon.json にエントリがあるポケモンは以下の動作:
 *   - baseStats / types を overrides で上書き（修正済み種族値・タイプを反映）
 *   - ability が未指定なら pokemon.json の 1 番目の特性（通常特性）をデフォルトに設定
 * pokemon.json にない場合は override 無し（@smogon/calc の内蔵データで動作）。
 */
function buildPokemonOptions(
  resolvedName: string,
  input: PokemonInput,
  natureEn: string,
  abilityEn: string | undefined,
  itemEn: string | undefined,
): ConstructorParameters<typeof Pokemon>[2] {
  const entry = pokemonById.get(toDataId(resolvedName));

  const baseOptions: ConstructorParameters<typeof Pokemon>[2] = {
    nature: natureEn,
    evs: toSmogonEvs(input.evs),
    boosts: toSmogonBoosts(input.boosts),
    ability: abilityEn ?? entry?.abilities[0],
    item: itemEn,
    status: (input.status ?? "") as StatusName,
  };

  if (entry !== undefined) {
    // @smogon/calc の Specie.types は文字列 union のタプル型。
    // pokemon.json では string[] で保持しているため、overrides の型要件に合わせてキャストする。
    baseOptions.overrides = buildSpeciesOverrides(entry) as NonNullable<
      ConstructorParameters<typeof Pokemon>[2]
    >["overrides"];
  }

  return baseOptions;
}

export class DamageCalculatorAdapter {
  private readonly resolvers: NameResolvers;

  constructor(resolvers: NameResolvers) {
    this.resolvers = resolvers;
  }

  calculate(input: DamageCalcInput): DamageCalcResult {
    const gen = Generations.get(CHAMPIONS_GEN_NUM);

    const attackerName = resolveNameWithFallback(
      this.resolvers.pokemon,
      input.attacker.name,
      "ポケモン",
    );
    const defenderName = resolveNameWithFallback(
      this.resolvers.pokemon,
      input.defender.name,
      "ポケモン",
    );
    const moveName = resolveNameWithFallback(
      this.resolvers.move,
      input.moveName,
      "技",
    );

    const attackerNature = this.resolveNature(input.attacker.nature);
    const defenderNature = this.resolveNature(input.defender.nature);

    const attackerAbility = resolveOptionalName(
      this.resolvers.ability,
      input.attacker.ability,
      "特性",
    );
    const defenderAbility = resolveOptionalName(
      this.resolvers.ability,
      input.defender.ability,
      "特性",
    );

    const attackerItem = resolveOptionalName(
      this.resolvers.item,
      input.attacker.item,
      "持ち物",
    );
    const defenderItem = resolveOptionalName(
      this.resolvers.item,
      input.defender.item,
      "持ち物",
    );

    const attacker = new Pokemon(
      gen,
      attackerName,
      buildPokemonOptions(
        attackerName,
        input.attacker,
        attackerNature,
        attackerAbility,
        attackerItem,
      ),
    );

    const defender = new Pokemon(
      gen,
      defenderName,
      buildPokemonOptions(
        defenderName,
        input.defender,
        defenderNature,
        defenderAbility,
        defenderItem,
      ),
    );

    const move = new Move(gen, moveName, {
      isCrit: input.conditions?.isCriticalHit,
    });

    const field = this.buildField(input.conditions);

    const result = calculate(gen, attacker, defender, move, field);

    const [min, max] = result.range();
    const defenderMaxHP = defender.maxHP();
    const minPercent =
      Math.round((min / defenderMaxHP) * PERCENT_MULTIPLIER * PERCENT_DECIMAL_PRECISION) /
      PERCENT_DECIMAL_PRECISION;
    const maxPercent =
      Math.round((max / defenderMaxHP) * PERCENT_MULTIPLIER * PERCENT_DECIMAL_PRECISION) /
      PERCENT_DECIMAL_PRECISION;

    const koResult = result.kochance();
    const damageArray = flattenDamage(result.damage);

    return {
      attacker: attackerName,
      defender: defenderName,
      move: moveName,
      damage: damageArray,
      min,
      max,
      minPercent,
      maxPercent,
      koChance: koResult.text,
      description: result.fullDesc(),
    };
  }

  calculateAllMoves(input: AllMovesCalcInput): DamageCalcResult[] {
    const gen = Generations.get(CHAMPIONS_GEN_NUM);

    const attackerName = resolveNameWithFallback(
      this.resolvers.pokemon,
      input.attacker.name,
      "ポケモン",
    );
    const defenderName = resolveNameWithFallback(
      this.resolvers.pokemon,
      input.defender.name,
      "ポケモン",
    );

    const attackerNature = this.resolveNature(input.attacker.nature);
    const defenderNature = this.resolveNature(input.defender.nature);

    const attackerAbility = resolveOptionalName(
      this.resolvers.ability,
      input.attacker.ability,
      "特性",
    );
    const defenderAbility = resolveOptionalName(
      this.resolvers.ability,
      input.defender.ability,
      "特性",
    );

    const attackerItem = resolveOptionalName(
      this.resolvers.item,
      input.attacker.item,
      "持ち物",
    );
    const defenderItem = resolveOptionalName(
      this.resolvers.item,
      input.defender.item,
      "持ち物",
    );

    const attacker = new Pokemon(
      gen,
      attackerName,
      buildPokemonOptions(
        attackerName,
        input.attacker,
        attackerNature,
        attackerAbility,
        attackerItem,
      ),
    );

    const defender = new Pokemon(
      gen,
      defenderName,
      buildPokemonOptions(
        defenderName,
        input.defender,
        defenderNature,
        defenderAbility,
        defenderItem,
      ),
    );

    const field = this.buildField(input.conditions);
    const defenderMaxHP = defender.maxHP();

    const results: DamageCalcResult[] = [];

    for (const moveData of gen.moves) {
      if (!moveData.basePower || moveData.basePower <= 0) {
        continue;
      }

      try {
        const move = new Move(gen, moveData.name, {
          isCrit: input.conditions?.isCriticalHit,
        });

        const result = calculate(gen, attacker, defender, move, field);
        const [min, max] = result.range();

        if (max <= 0) {
          continue;
        }

        const minPercent =
          Math.round((min / defenderMaxHP) * PERCENT_MULTIPLIER * PERCENT_DECIMAL_PRECISION) /
          PERCENT_DECIMAL_PRECISION;
        const maxPercent =
          Math.round((max / defenderMaxHP) * PERCENT_MULTIPLIER * PERCENT_DECIMAL_PRECISION) /
          PERCENT_DECIMAL_PRECISION;

        const koResult = result.kochance();
        const damageArray = flattenDamage(result.damage);

        results.push({
          attacker: attackerName,
          defender: defenderName,
          move: moveData.name,
          damage: damageArray,
          min,
          max,
          minPercent,
          maxPercent,
          koChance: koResult.text,
          description: result.fullDesc(),
        });
      } catch {
        // 計算不可能な技はスキップする
      }
    }

    results.sort((a, b) => b.max - a.max);

    return results;
  }

  createPokemonObject(input: PokemonInput): {
    pokemon: Pokemon;
    resolvedName: string;
  } {
    const gen = Generations.get(CHAMPIONS_GEN_NUM);

    const resolvedName = resolveNameWithFallback(
      this.resolvers.pokemon,
      input.name,
      "ポケモン",
    );

    const nature = this.resolveNature(input.nature);
    const ability = resolveOptionalName(
      this.resolvers.ability,
      input.ability,
      "特性",
    );
    const item = resolveOptionalName(
      this.resolvers.item,
      input.item,
      "持ち物",
    );

    const pokemon = new Pokemon(
      gen,
      resolvedName,
      buildPokemonOptions(resolvedName, input, nature, ability, item),
    );

    return { pokemon, resolvedName };
  }

  getGen(): ReturnType<typeof Generations.get> {
    return Generations.get(CHAMPIONS_GEN_NUM);
  }

  get pokemonResolver(): NameResolver {
    return this.resolvers.pokemon;
  }

  get moveResolver(): NameResolver {
    return this.resolvers.move;
  }

  get natureResolver(): NameResolver {
    return this.resolvers.nature;
  }

  private resolveNature(nature: string | undefined): string {
    if (nature === undefined) {
      return DEFAULT_NATURE_EN;
    }
    return resolveNameWithFallback(this.resolvers.nature, nature, "性格");
  }

  private buildField(conditions: ConditionsInput | undefined): Field {
    if (conditions === undefined) {
      return new Field();
    }

    return new Field({
      weather: conditions.weather as "Sun" | "Rain" | "Sand" | "Hail" | "Snow" | undefined,
      terrain: conditions.terrain as "Electric" | "Grassy" | "Misty" | "Psychic" | undefined,
      defenderSide: {
        isReflect: conditions.isReflect ?? false,
        isLightScreen: conditions.isLightScreen ?? false,
        isAuroraVeil: conditions.isAuroraVeil ?? false,
      },
    });
  }
}
