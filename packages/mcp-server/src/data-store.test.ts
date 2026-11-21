import { describe, it, expect } from "vitest";
import {
  championsAbilities,
  championsItems,
  championsLearnsets,
  championsMoves,
  championsPokemon,
  learnsetProvider,
} from "./data-store";

/**
 * data/champions/CLAUDE.md に明文化された不変条件を全件走査で検証する。
 * 件数（327 件等）はロックしない。データ追加のたびに壊れる回帰を防ぐのが目的であり、
 * 件数そのものを固定するテストではない。
 */

function findDuplicateIds(entries: readonly { id: string }[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) {
      duplicates.add(entry.id);
    }
    seen.add(entry.id);
  }
  return [...duplicates];
}

describe("マスターデータの不変条件", () => {
  describe("id の重複禁止", () => {
    it("pokemon.json に id が重複するエントリが無い", () => {
      expect(findDuplicateIds(championsPokemon)).toEqual([]);
    });

    it("abilities.json に id が重複するエントリが無い", () => {
      expect(findDuplicateIds(championsAbilities)).toEqual([]);
    });

    it("items.json に id が重複するエントリが無い", () => {
      expect(findDuplicateIds(championsItems)).toEqual([]);
    });
  });

  describe("pokemon.json の相互参照", () => {
    const pokemonNames = new Set(championsPokemon.map((p) => p.name));

    it("baseSpecies の参照先が pokemon.json に実在する", () => {
      const invalidRefs = championsPokemon
        .filter((p) => p.baseSpecies !== null && !pokemonNames.has(p.baseSpecies))
        .map((p) => ({ id: p.id, baseSpecies: p.baseSpecies }));

      expect(invalidRefs).toEqual([]);
    });

    it("otherFormes の参照先が pokemon.json に実在する", () => {
      const invalidRefs = championsPokemon.flatMap((p) => {
        if (p.otherFormes === null) return [];
        return p.otherFormes
          .filter((forme) => !pokemonNames.has(forme))
          .map((forme) => ({ id: p.id, forme }));
      });

      expect(invalidRefs).toEqual([]);
    });

    it("abilities の参照先が abilities.json に実在する", () => {
      const abilityNames = new Set(championsAbilities.map((a) => a.name));
      const invalidRefs = championsPokemon.flatMap((p) =>
        p.abilities
          .filter((ability) => !abilityNames.has(ability))
          .map((ability) => ({ id: p.id, ability })),
      );

      expect(invalidRefs).toEqual([]);
    });
  });

  describe("items.json のメガストーン参照", () => {
    const pokemonNames = new Set(championsPokemon.map((p) => p.name));

    it("megaStone の参照先が pokemon.json に実在する", () => {
      const invalidRefs = championsItems
        // megaStone 未設定の項目は null のものと key 自体が無いものが混在するため
        // undefined も合わせて除外する。
        .filter(
          (i) =>
            i.megaStone !== null &&
            i.megaStone !== undefined &&
            !pokemonNames.has(i.megaStone),
        )
        .map((i) => ({ id: i.id, megaStone: i.megaStone }));

      expect(invalidRefs).toEqual([]);
    });

    it("megaEvolves の参照先が pokemon.json に実在する", () => {
      const invalidRefs = championsItems
        .filter(
          (i) =>
            i.megaEvolves !== null &&
            i.megaEvolves !== undefined &&
            !pokemonNames.has(i.megaEvolves),
        )
        .map((i) => ({ id: i.id, megaEvolves: i.megaEvolves }));

      expect(invalidRefs).toEqual([]);
    });
  });

  describe("pokemon.json の weightkg", () => {
    it("全ポケモンエントリで weightkg が 0 より大きい", () => {
      // weightkg=0 だと重さ依存技 (くさむすび等) が最低威力で計算されてしまうため、
      // 全件で正の値を持つことを保証する。
      const invalidEntries = championsPokemon
        .filter((p) => !(p.weightkg > 0))
        .map((p) => ({ id: p.id, weightkg: p.weightkg }));

      expect(invalidEntries).toEqual([]);
    });
  });

  describe("learnsets の相互参照", () => {
    it("learnsets のキーが pokemon.json の id に実在する", () => {
      const pokemonIds = new Set(championsPokemon.map((p) => p.id));
      const invalidKeys = Object.keys(championsLearnsets).filter(
        (id) => !pokemonIds.has(id),
      );

      expect(invalidKeys).toEqual([]);
    });

    it("learnsets の技 ID が moves.json に実在する", () => {
      const moveIds = new Set(championsMoves.map((m) => m.id));
      const invalidRefs = Object.entries(championsLearnsets).flatMap(
        ([pokemonId, moveIdList]) =>
          moveIdList
            .filter((moveId) => !moveIds.has(moveId))
            .map((moveId) => ({ pokemonId, moveId })),
      );

      expect(invalidRefs).toEqual([]);
    });
  });

  describe("learnsets の網羅", () => {
    it("全ベースフォームが learnset を持つ", () => {
      const learnsetKeys = new Set(Object.keys(championsLearnsets));
      const missingLearnsetBaseIds = championsPokemon
        .filter((p) => p.baseSpecies === null && !learnsetKeys.has(p.id))
        .map((p) => p.id)
        .sort();

      // ベースフォームに learnset が無いと分析ツールが全技フォールバックになり、
      // 覚えない技を最良技として返してしまうため、恒久不変条件として固定する。
      expect(missingLearnsetBaseIds).toEqual([]);
    });
  });
});

describe("learnsetProvider", () => {
  it("learnset を持つポケモンはその習得技を返す", () => {
    expect(learnsetProvider.getMoveIds("Alakazam").has("psychic")).toBe(true);
  });

  it("learnset 未整備のフォルムは元のポケモンの習得技を返す", () => {
    expect(championsLearnsets["alakazammega"]).toBeUndefined();
    expect([...learnsetProvider.getMoveIds("Alakazam-Mega")]).toEqual([
      ...learnsetProvider.getMoveIds("Alakazam"),
    ]);
  });

  it("性別で技が違うポケモンのメガシンカは、同じ性別のフォルムの習得技を返す", () => {
    expect([...learnsetProvider.getMoveIds("Meowstic-F-Mega")]).toEqual([
      ...learnsetProvider.getMoveIds("Meowstic-F"),
    ]);
    expect(learnsetProvider.getMoveIds("Meowstic-F-Mega").has("extrasensory")).toBe(true);
  });

  it("learnset 未整備のフォルムはすべて元のポケモンの習得技で補える", () => {
    const formsWithoutMoves = championsPokemon
      .filter((p) => learnsetProvider.getMoveIds(p.name).size === 0)
      .map((p) => p.id);

    expect(formsWithoutMoves).toEqual([]);
  });

  it("未登録のポケモン名は空集合を返す", () => {
    expect(learnsetProvider.getMoveIds("Sonic").size).toBe(0);
  });
});
