import { calculate, Generations, Pokemon, Move, Field } from "@smogon/calc";
import type { NameResolver } from "@ai-rotom/shared";

const CHAMPIONS_GEN_NUM = 0;
const DEFAULT_NATURE_EN = "Serious";

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

function flattenDamage(damage: number | number[] | number[][]): number[] {
  if (typeof damage === "number") {
    return [damage];
  }
  if (Array.isArray(damage) && damage.length > 0 && Array.isArray(damage[0])) {
    return (damage as number[][]).flat();
  }
  return damage as number[];
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

    const attacker = new Pokemon(gen, attackerName, {
      nature: attackerNature,
      evs: toSmogonEvs(input.attacker.evs),
      boosts: toSmogonBoosts(input.attacker.boosts),
      ability: attackerAbility,
      item: attackerItem,
      status: (input.attacker.status ?? "") as "" | "psn" | "tox" | "brn" | "par" | "slp" | "frz",
    });

    const defender = new Pokemon(gen, defenderName, {
      nature: defenderNature,
      evs: toSmogonEvs(input.defender.evs),
      boosts: toSmogonBoosts(input.defender.boosts),
      ability: defenderAbility,
      item: defenderItem,
      status: (input.defender.status ?? "") as "" | "psn" | "tox" | "brn" | "par" | "slp" | "frz",
    });

    const move = new Move(gen, moveName, {
      isCrit: input.conditions?.isCriticalHit,
    });

    const field = this.buildField(input.conditions);

    const result = calculate(gen, attacker, defender, move, field);

    const [min, max] = result.range();
    const defenderMaxHP = defender.maxHP();
    const minPercent =
      Math.round((min / defenderMaxHP) * PERCENT_MULTIPLIER * 10) / 10;
    const maxPercent =
      Math.round((max / defenderMaxHP) * PERCENT_MULTIPLIER * 10) / 10;

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
