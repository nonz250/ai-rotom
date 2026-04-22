import { describe, it, expect } from "vitest";
import { Generations, Pokemon } from "@smogon/calc";
import type { TypeName } from "@smogon/calc/dist/data/interface";
import {
  DamageCalculatorAdapter,
  calculateTypeEffectiveness,
  extractPriorityMoves,
  filterResultsByLearnset,
} from "@ai-rotom/shared";
import {
  championsLearnsets,
  getLearnsetMoveIdSet,
  movesById,
  pokemonEntryProvider,
  toDataId,
} from "../../data-store";
import {
  pokemonNameResolver,
  moveNameResolver,
  abilityNameResolver,
  itemNameResolver,
  natureNameResolver,
} from "../../name-resolvers";

const CHAMPIONS_GEN_NUM = 0;

describe("analyze_matchup logic", () => {
  const adapter = new DamageCalculatorAdapter(
    {
      pokemon: pokemonNameResolver,
      move: moveNameResolver,
      ability: abilityNameResolver,
      item: itemNameResolver,
      nature: natureNameResolver,
    },
    pokemonEntryProvider,
  );

  describe("正常系", () => {
    it("日本語名でマッチアップ分析が実行できる", () => {
      const { pokemon: p1, resolvedName: name1 } =
        adapter.createPokemonObject({ name: "リザードン" });
      const { pokemon: p2, resolvedName: name2 } =
        adapter.createPokemonObject({ name: "ギャラドス" });

      expect(name1).toBe("Charizard");
      expect(name2).toBe("Gyarados");
      expect(p1.stats.spe).toBeGreaterThan(0);
      expect(p2.stats.spe).toBeGreaterThan(0);

      // 双方向のダメージ計算
      const p1Attacks = adapter.calculateAllMoves({
        attacker: { name: "リザードン" },
        defender: { name: "ギャラドス" },
      });

      const p2Attacks = adapter.calculateAllMoves({
        attacker: { name: "ギャラドス" },
        defender: { name: "リザードン" },
      });

      expect(p1Attacks.length).toBeGreaterThan(0);
      expect(p2Attacks.length).toBeGreaterThan(0);
    });

    it("素早さ比較が正しく行われる", () => {
      const gen = Generations.get(CHAMPIONS_GEN_NUM);

      // リザードン (base spe: 100) vs ギャラドス (base spe: 81)
      const charizard = new Pokemon(gen, "Charizard");
      const gyarados = new Pokemon(gen, "Gyarados");

      expect(charizard.stats.spe).toBeGreaterThan(gyarados.stats.spe);
    });

    it("能力ポイントによる素早さ変動が反映される", () => {
      const { pokemon: pDefault } = adapter.createPokemonObject({
        name: "ギャラドス",
      });

      const { pokemon: pMaxSpe } = adapter.createPokemonObject({
        name: "ギャラドス",
        nature: "ようき",
        evs: { spe: 32 },
      });

      expect(pMaxSpe.stats.spe).toBeGreaterThan(pDefault.stats.spe);
    });
  });

  describe("エラー系", () => {
    it("存在しないポケモン名でエラーになる", () => {
      expect(() =>
        adapter.createPokemonObject({ name: "ソニック" }),
      ).toThrow("ポケモン「ソニック」が見つかりません。");
    });
  });

  describe("learnset フィルタ適用", () => {
    it("attacker が覚えない技はダメ計結果から除外される", () => {
      // ピカチュウ (Electric 単) は hydrocannon / blastburn / frenzyplant を
      // 覚えない。@smogon/calc は全技 DB を走査するため、フィルタしないと
      // これらがダメ計結果に混入する。
      const attacks = adapter.calculateAllMoves({
        attacker: { name: "ピカチュウ" },
        defender: { name: "ギャラドス" },
      });

      const learnsetIds = getLearnsetMoveIdSet(toDataId("Pikachu"));
      const filtered = filterResultsByLearnset(attacks, learnsetIds, toDataId);

      const filteredMoveIds = new Set(filtered.map((r) => toDataId(r.move)));
      expect(filteredMoveIds.has("hydrocannon")).toBe(false);
      expect(filteredMoveIds.has("blastburn")).toBe(false);
      expect(filteredMoveIds.has("frenzyplant")).toBe(false);

      // 覚える技（かみなり / 10まんボルト等）は残る
      expect(filteredMoveIds.has("thunderbolt")).toBe(true);

      // 少なくとも 1 件以上削減されている
      expect(filtered.length).toBeLessThan(attacks.length);
    });

    it("フィルタ後も攻撃技が 1 件以上残る", () => {
      const attacks = adapter.calculateAllMoves({
        attacker: { name: "ピカチュウ" },
        defender: { name: "ギャラドス" },
      });

      const learnsetIds = getLearnsetMoveIdSet(toDataId("Pikachu"));
      const filtered = filterResultsByLearnset(attacks, learnsetIds, toDataId);

      expect(filtered.length).toBeGreaterThan(0);
    });

    it("learnset 未登録のポケモン（メガ進化後等）は全件返される（フォールバック）", () => {
      // メガ進化後（例: メガフーディン）は learnset が独立していないため
      // championsLearnsets[id] === undefined となる。
      // この場合 filterResultsByLearnset は元の配列をそのまま返す。
      const megaId = toDataId("Alakazam-Mega");
      expect(championsLearnsets[megaId]).toBeUndefined();

      const attacks = adapter.calculateAllMoves({
        attacker: { name: "メガフーディン" },
        defender: { name: "ギャラドス" },
      });

      const learnsetIds = getLearnsetMoveIdSet(megaId);
      expect(learnsetIds.size).toBe(0);

      const filtered = filterResultsByLearnset(attacks, learnsetIds, toDataId);
      expect(filtered.length).toBe(attacks.length);
    });

    it("getLearnsetMoveIdSet は learnset JSON の技 ID を正規化して返す", () => {
      const pikachuIds = getLearnsetMoveIdSet(toDataId("Pikachu"));
      expect(pikachuIds.size).toBeGreaterThan(0);
      expect(pikachuIds.has("thunderbolt")).toBe(true);
    });
  });

  describe("先制技抽出", () => {
    function priorityMovesFor(resolvedName: string) {
      const learnsetMoveIds =
        championsLearnsets[toDataId(resolvedName)] ?? [];
      return extractPriorityMoves({
        learnsetMoveIds,
        resolveMove: (id) => movesById.get(id),
        toJapanese: (en) => moveNameResolver.toJapanese(en),
      });
    }

    it("先制技を持つポケモン（イワパレス）から静的 priority 技が抽出される", () => {
      const result = priorityMovesFor("Incineroar");

      expect(result.length).toBeGreaterThan(0);
      const fakeout = result.find((m) => m.move === "Fake Out");
      expect(fakeout).toBeDefined();
      expect(fakeout?.priority).toBe(3);
      expect(fakeout?.moveJa).toBe("ねこだまし");
      expect(fakeout?.category).toBe("Physical");
    });

    it("priority 降順でソートされる", () => {
      const result = priorityMovesFor("Incineroar");

      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].priority).toBeGreaterThanOrEqual(
          result[i].priority,
        );
      }
    });

    it("先制技を持たないポケモン（メタモン）では空配列を返す", () => {
      const result = priorityMovesFor("Ditto");

      expect(result).toEqual([]);
    });

    it("learnset が未登録のポケモン名でも空配列を返す（防衛的フォールバック）", () => {
      const result = priorityMovesFor("NonExistentPokemon");

      expect(result).toEqual([]);
    });
  });

  describe("STAB・タイプ相性の構造化出力", () => {
    it("リザードン→ギャラドスの各技に STAB / typeMultiplier / effectivePowerMultiplier が付与される", () => {
      const results = adapter.calculateAllMoves({
        attacker: { name: "リザードン" },
        defender: { name: "ギャラドス" },
      });

      // かえんほうしゃ: ほのお技（STAB） × みず/ひこう = 0.5 倍
      const flamethrower = results.find((r) => r.move === "Flamethrower");
      expect(flamethrower).toBeDefined();
      expect(flamethrower!.moveType).toBe("Fire");
      expect(flamethrower!.isStab).toBe(true);
      expect(flamethrower!.typeMultiplier).toBe(0.5);
      const STAB_TIMES_HALF = 0.75;
      expect(flamethrower!.effectivePowerMultiplier).toBe(STAB_TIMES_HALF);

      // 10まんボルト: でんき技（非STAB） × みず/ひこう = 4 倍（抜群×抜群）
      const thunderbolt = results.find((r) => r.move === "Thunderbolt");
      expect(thunderbolt).toBeDefined();
      expect(thunderbolt!.moveType).toBe("Electric");
      expect(thunderbolt!.isStab).toBe(false);
      const QUAD_EFFECTIVE = 4;
      expect(thunderbolt!.typeMultiplier).toBe(QUAD_EFFECTIVE);
      expect(thunderbolt!.effectivePowerMultiplier).toBe(QUAD_EFFECTIVE);
    });

    it("typeSummary は両ポケモンのタイプに基づく最大相性倍率を返す", () => {
      const { pokemon: p1 } = adapter.createPokemonObject({ name: "リザードン" });
      const { pokemon: p2 } = adapter.createPokemonObject({ name: "ギャラドス" });

      // p1 (ほのお/ひこう) → p2 (みず/ひこう): Fire=0.5, Flying=1 → max 1
      // p2 (みず/ひこう) → p1 (ほのお/ひこう): Water=2, Flying=1 → max 2
      const gen = adapter.getGen();

      const p1Max = Math.max(
        ...(p1.types as readonly TypeName[]).map((t) =>
          calculateTypeEffectiveness(gen, t, p2.types as readonly TypeName[]),
        ),
      );
      const p2Max = Math.max(
        ...(p2.types as readonly TypeName[]).map((t) =>
          calculateTypeEffectiveness(gen, t, p1.types as readonly TypeName[]),
        ),
      );

      const EXPECTED_P1_MAX = 1;
      const EXPECTED_P2_MAX = 2;
      expect(p1Max).toBe(EXPECTED_P1_MAX);
      expect(p2Max).toBe(EXPECTED_P2_MAX);
    });
  });
});
