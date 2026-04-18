import { calculate, Generations, Pokemon, Move } from "@smogon/calc";
import { NameResolver } from "../utils/name-resolver.js";
import type { PokemonEntryProvider } from "../types/pokemon.js";
import {
  resolveNameWithFallback,
  resolveOptionalName,
} from "./resolvers/resolve-name.js";
import { buildPokemonOptions } from "./builders/pokemon-builder.js";
import { buildField } from "./builders/field-builder.js";
import { flattenDamage, toPercent } from "./formatters/result-formatter.js";
import type {
  AllMovesCalcInput,
  DamageCalcInput,
  DamageCalcResult,
  PokemonInput,
} from "./types.js";

const CHAMPIONS_GEN_NUM = 0;
const DEFAULT_NATURE_EN = "Serious";

export interface NameResolvers {
  pokemon: NameResolver;
  move: NameResolver;
  ability: NameResolver;
  item: NameResolver;
  nature: NameResolver;
}

/**
 * @smogon/calc のラッパー。日本語名入力を受け付け、
 * 名前解決・Pokemon/Move/Field 組み立て・結果整形をまとめて担う Facade。
 *
 * 実装の詳細は下記モジュールに分離している:
 *   - resolvers/resolve-name: 日本語→英語の名前解決
 *   - builders/pokemon-builder: @smogon/calc の Pokemon options 構築
 *   - builders/field-builder: @smogon/calc の Field 構築
 *   - formatters/result-formatter: ダメージ結果の整形（flatten・%変換）
 *
 * このクラスは data-store 等の具体実装に直接依存せず、
 * 必要なデータは resolvers と entryProvider を通じて注入される。
 */
export class DamageCalculatorAdapter {
  private readonly resolvers: NameResolvers;
  private readonly entryProvider: PokemonEntryProvider | undefined;

  constructor(
    resolvers: NameResolvers,
    entryProvider?: PokemonEntryProvider,
  ) {
    this.resolvers = resolvers;
    this.entryProvider = entryProvider;
  }

  calculate(input: DamageCalcInput): DamageCalcResult {
    const gen = this.getGen();

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
        input.attacker,
        attackerNature,
        attackerAbility,
        attackerItem,
        this.entryProvider?.getByName(attackerName),
      ),
    );

    const defender = new Pokemon(
      gen,
      defenderName,
      buildPokemonOptions(
        input.defender,
        defenderNature,
        defenderAbility,
        defenderItem,
        this.entryProvider?.getByName(defenderName),
      ),
    );

    const move = new Move(gen, moveName, {
      isCrit: input.conditions?.isCriticalHit,
    });

    const field = buildField(input.conditions);

    const result = calculate(gen, attacker, defender, move, field);

    const [min, max] = result.range();
    const defenderMaxHP = defender.maxHP();
    const minPercent = toPercent(min, defenderMaxHP);
    const maxPercent = toPercent(max, defenderMaxHP);

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
    const gen = this.getGen();

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
        input.attacker,
        attackerNature,
        attackerAbility,
        attackerItem,
        this.entryProvider?.getByName(attackerName),
      ),
    );

    const defender = new Pokemon(
      gen,
      defenderName,
      buildPokemonOptions(
        input.defender,
        defenderNature,
        defenderAbility,
        defenderItem,
        this.entryProvider?.getByName(defenderName),
      ),
    );

    const field = buildField(input.conditions);
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

        const minPercent = toPercent(min, defenderMaxHP);
        const maxPercent = toPercent(max, defenderMaxHP);

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
    const gen = this.getGen();

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
      buildPokemonOptions(
        input,
        nature,
        ability,
        item,
        this.entryProvider?.getByName(resolvedName),
      ),
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
}

// 既存呼び出し側の import パス互換性維持のため、型を types.ts から re-export する。
export type {
  AllMovesCalcInput,
  ConditionsInput,
  DamageCalcInput,
  DamageCalcResult,
  PokemonInput,
  StatsInput,
  PokemonEntryProvider,
} from "./types.js";
