import { describe, it, expect, beforeAll } from "vitest";
import { Generations, toID } from "@smogon/calc";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  championsLearnsets,
  championsTypes,
  movesById,
  pokemonById,
  toDataId,
} from "../../data-store";
import { pokemonNameResolver } from "../../name-resolvers";
import {
  buildCandidateEntries,
  buildSignature,
  extractBuildInfo,
  registerFindCountersTool,
  type FindCountersOutput,
} from "./find-counters";

const CHAMPIONS_GEN_NUM = 0;

type ToolHandler = (args: unknown) => Promise<{
  content: { type: string; text: string }[];
  isError?: boolean;
}>;

/**
 * find_counters の tool ハンドラを取得する。
 * registerFindCountersTool が呼び出す server.tool の 4 番目の引数を捕捉する。
 */
function captureHandler(): ToolHandler {
  let captured: ToolHandler | undefined;
  const mockServer = {
    tool: (
      _name: string,
      _description: string,
      _schema: unknown,
      handler: ToolHandler,
    ) => {
      captured = handler;
      return {} as never;
    },
  } as unknown as McpServer;
  registerFindCountersTool(mockServer);
  if (captured === undefined) {
    throw new Error("find_counters handler was not registered.");
  }
  return captured;
}

async function callFindCounters(
  args: Record<string, unknown>,
): Promise<FindCountersOutput> {
  const handler = captureHandler();
  const res = await handler(args);
  expect(res.isError ?? false).toBe(false);
  return JSON.parse(res.content[0].text) as FindCountersOutput;
}

describe("find_counters logic", () => {
  const gen = Generations.get(CHAMPIONS_GEN_NUM);

  function calcMultiplier(
    attackTypeName: string,
    defenderTypes: readonly string[],
  ): number {
    const attackType = gen.types.get(toID(attackTypeName));
    if (attackType === undefined) return 1;
    const eff = attackType.effectiveness as Record<string, number>;
    let m = 1;
    for (const t of defenderTypes) {
      const v = eff[t];
      if (v !== undefined) m *= v;
    }
    return m;
  }

  describe("typeWeaknesses 検出", () => {
    it("ガブリアス (Dragon/Ground) の弱点は こおり・ドラゴン・フェアリー", () => {
      const SUPER_EFFECTIVE_MIN = 2;
      const garchomp = pokemonById.get(toDataId("Garchomp"))!;

      const weaknessTypes: string[] = [];
      for (const t of championsTypes) {
        const m = calcMultiplier(t.name, garchomp.types);
        if (m >= SUPER_EFFECTIVE_MIN) weaknessTypes.push(t.name);
      }

      expect(weaknessTypes).toContain("Ice");
      expect(weaknessTypes).toContain("Dragon");
      expect(weaknessTypes).toContain("Fairy");
    });

    it("こおりは ガブリアスに 4 倍（Dragon x Ground 両方に効果抜群）", () => {
      const FOUR = 4;
      const garchomp = pokemonById.get(toDataId("Garchomp"))!;
      expect(calcMultiplier("Ice", garchomp.types)).toBe(FOUR);
    });
  });

  describe("前フィルタ: 弱点タイプの攻撃技を持つポケモンだけを候補にする", () => {
    it("マニューラ (Dark/Ice) はこおり攻撃技を覚えるのでガブリアス対策候補に含まれる", () => {
      const weavile = pokemonById.get(toDataId("Weavile"))!;
      const learnset = championsLearnsets[weavile.id];
      expect(learnset).toBeDefined();

      const hasIceAttack = learnset.some((moveId) => {
        const move = movesById.get(moveId);
        if (move === undefined) return false;
        if (move.category === "Status") return false;
        return move.type === "Ice";
      });
      expect(hasIceAttack).toBe(true);
    });

    it("マンムー (Ice/Ground) もこおり攻撃技を覚える", () => {
      const mamoswine = pokemonById.get(toDataId("Mamoswine"))!;
      const learnset = championsLearnsets[mamoswine.id];
      expect(learnset).toBeDefined();

      const hasIceAttack = learnset.some((moveId) => {
        const move = movesById.get(moveId);
        if (move === undefined) return false;
        if (move.category === "Status") return false;
        return move.type === "Ice";
      });
      expect(hasIceAttack).toBe(true);
    });
  });

  describe("候補プール指定", () => {
    it("candidatePool に指定した名前が解決できる", () => {
      expect(pokemonNameResolver.toEnglish("マニューラ")).toBe("Weavile");
    });

    it("存在しないポケモン名は resolver が undefined", () => {
      expect(pokemonNameResolver.toEnglish("スーパーポケモン")).toBeUndefined();
    });
  });

  describe("ガブリアス対策に氷技持ちが上位に来ることを想定", () => {
    it("Weavile (マニューラ) は Dark/Ice タイプで素早さ 125 (base)", () => {
      const weavile = pokemonById.get(toDataId("Weavile"))!;
      expect(weavile.types).toContain("Ice");
      const WEAVILE_BASE_SPE = 125;
      expect(weavile.baseStats.spe).toBe(WEAVILE_BASE_SPE);
    });

    it("Garchomp (ガブリアス) の base spe は 102", () => {
      const garchomp = pokemonById.get(toDataId("Garchomp"))!;
      const GARCHOMP_BASE_SPE = 102;
      expect(garchomp.baseStats.spe).toBe(GARCHOMP_BASE_SPE);
    });
  });

  describe("candidatePool の build 指定 (union 入力)", () => {
    const garchomp = pokemonById.get(toDataId("Garchomp"))!;

    it("string 指定はデフォルト build として正規化される", () => {
      const candidates = buildCandidateEntries(["マニューラ"], garchomp, gen);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].entry.name).toBe("Weavile");
      expect(candidates[0].input).toEqual({ name: "Weavile" });
      expect(candidates[0].hasExplicitBuild).toBe(false);
    });

    it("PokemonInput 指定は build 情報を保持し hasExplicitBuild=true になる", () => {
      const maxSpe = 32;
      const candidates = buildCandidateEntries(
        [
          {
            name: "ガブリアス",
            ability: "さめはだ",
            item: "こだわりスカーフ",
            nature: "ようき",
            evs: { spe: maxSpe },
          },
        ],
        pokemonById.get(toDataId("Dragapult"))!,
        gen,
      );

      expect(candidates).toHaveLength(1);
      expect(candidates[0].entry.name).toBe("Garchomp");
      expect(candidates[0].input.name).toBe("Garchomp");
      expect(candidates[0].input.ability).toBe("さめはだ");
      expect(candidates[0].input.item).toBe("こだわりスカーフ");
      expect(candidates[0].input.nature).toBe("ようき");
      expect(candidates[0].input.evs).toEqual({ spe: maxSpe });
      expect(candidates[0].hasExplicitBuild).toBe(true);
    });

    it("string と PokemonInput を混在指定できる", () => {
      const EXPECTED_COUNT = 2;
      const candidates = buildCandidateEntries(
        [
          "マニューラ",
          { name: "ガブリアス", ability: "さめはだ", item: "こだわりハチマキ" },
        ],
        pokemonById.get(toDataId("Dragapult"))!,
        gen,
      );

      expect(candidates).toHaveLength(EXPECTED_COUNT);
      expect(candidates[0].hasExplicitBuild).toBe(false);
      expect(candidates[1].hasExplicitBuild).toBe(true);
      expect(candidates[1].input.item).toBe("こだわりハチマキ");
    });

    it("同名ポケモンの build 違いを並存させられる", () => {
      const EXPECTED_COUNT = 2;
      const candidates = buildCandidateEntries(
        [
          { name: "ガブリアス", nature: "ようき", item: "こだわりスカーフ" },
          { name: "ガブリアス", nature: "いじっぱり", item: "こだわりハチマキ" },
        ],
        pokemonById.get(toDataId("Dragapult"))!,
        gen,
      );

      expect(candidates).toHaveLength(EXPECTED_COUNT);
      expect(candidates[0].entry.name).toBe("Garchomp");
      expect(candidates[1].entry.name).toBe("Garchomp");

      const sig1 = buildSignature(candidates[0]);
      const sig2 = buildSignature(candidates[1]);
      expect(sig1).not.toBe(sig2);
    });

    it("buildSignature は hasExplicitBuild=false なら default を返す", () => {
      const candidates = buildCandidateEntries(["マニューラ"], garchomp, gen);
      expect(buildSignature(candidates[0])).toBe("default");
    });

    it("extractBuildInfo は未指定フィールドを含めない", () => {
      const result = extractBuildInfo({
        name: "ガブリアス",
        ability: "さめはだ",
      });
      expect(result).toEqual({ ability: "さめはだ" });
      expect(Object.keys(result)).not.toContain("item");
      expect(Object.keys(result)).not.toContain("name");
    });

    it("extractBuildInfo は指定されたフィールドをすべて抽出する", () => {
      const maxAtk = 32;
      const atkBoost = 2;
      const result = extractBuildInfo({
        name: "ガブリアス",
        ability: "さめはだ",
        item: "こだわりハチマキ",
        nature: "いじっぱり",
        evs: { atk: maxAtk },
        boosts: { atk: atkBoost },
        status: "par",
      });
      expect(result.ability).toBe("さめはだ");
      expect(result.item).toBe("こだわりハチマキ");
      expect(result.nature).toBe("いじっぱり");
      expect(result.evs).toEqual({ atk: maxAtk });
      expect(result.boosts).toEqual({ atk: atkBoost });
      expect(result.status).toBe("par");
    });

    it("未指定時 (candidatePool=undefined) は hasExplicitBuild=false の候補が生成される", () => {
      const candidates = buildCandidateEntries(undefined, garchomp, gen);
      expect(candidates.length).toBeGreaterThan(0);
      for (const c of candidates) {
        expect(c.hasExplicitBuild).toBe(false);
        expect(c.input).toEqual({ name: c.entry.name });
      }
    });

    it("存在しないポケモン名でエラーになる (string)", () => {
      expect(() =>
        buildCandidateEntries(["スーパーポケモン"], garchomp, gen),
      ).toThrow();
    });

    it("存在しないポケモン名でエラーになる (PokemonInput)", () => {
      expect(() =>
        buildCandidateEntries(
          [{ name: "スーパーポケモン", ability: "さめはだ" }],
          garchomp,
          gen,
        ),
      ).toThrow();
    });
  });
});

describe("find_counters tool レスポンス構造", () => {
  let output: FindCountersOutput;

  beforeAll(async () => {
    output = await callFindCounters({
      target: { name: "ガブリアス" },
      candidatePool: ["マニューラ", "マンムー", "ゲッコウガ"],
    });
  });

  it("target 情報が返る", () => {
    expect(output.target.name).toBe("Garchomp");
    expect(output.target.nameJa).toBe("ガブリアス");
    expect(output.target.typeWeaknesses.map((w) => w.type)).toEqual(
      expect.arrayContaining(["Ice", "Dragon", "Fairy"]),
    );
    expect(output.target.stats.spe).toBeGreaterThan(0);
  });

  it("各 CounterEntry は新構造（speedCompare / outgoing / incoming）を持つ", () => {
    expect(output.counters.length).toBeGreaterThan(0);
    for (const c of output.counters) {
      expect(c.pokemon).toBeDefined();
      expect(c.pokemon.id).toBeTypeOf("string");
      expect(c.pokemon.name).toBeTypeOf("string");
      expect(c.pokemon.nameJa).toBeTypeOf("string");
      expect(Array.isArray(c.pokemon.types)).toBe(true);
      expect(["faster", "slower", "tie"]).toContain(c.speedCompare);
      expect(Array.isArray(c.outgoing)).toBe(true);
      expect(Array.isArray(c.incoming)).toBe(true);
    }
  });

  it("旧フィールド（score / strategy / details）を返さない", () => {
    for (const c of output.counters) {
      const record = c as unknown as Record<string, unknown>;
      expect(record.score).toBeUndefined();
      expect(record.strategy).toBeUndefined();
      expect(record.details).toBeUndefined();
    }
  });

  it("outgoing / incoming は best 1 件ではなく候補の全技を含む", () => {
    const weavile = output.counters.find((c) => c.pokemon.name === "Weavile");
    expect(weavile).toBeDefined();
    expect(weavile!.outgoing.length).toBeGreaterThan(1);
    expect(weavile!.incoming.length).toBeGreaterThan(1);
  });

  it("outgoing は attacker の learnset でフィルタされている", () => {
    const weavile = output.counters.find((c) => c.pokemon.name === "Weavile");
    expect(weavile).toBeDefined();
    const weavileLearnset = new Set(
      championsLearnsets[toDataId("Weavile")] ?? [],
    );
    for (const r of weavile!.outgoing) {
      expect(weavileLearnset.has(toDataId(r.move))).toBe(true);
    }
  });

  it("incoming は target (Garchomp) の learnset でフィルタされている", () => {
    const weavile = output.counters.find((c) => c.pokemon.name === "Weavile");
    expect(weavile).toBeDefined();
    const garchompLearnset = new Set(
      championsLearnsets[toDataId("Garchomp")] ?? [],
    );
    for (const r of weavile!.incoming) {
      expect(garchompLearnset.has(toDataId(r.move))).toBe(true);
    }
  });

  it("counters は pokemon.name 英名昇順でソートされている", () => {
    const names = output.counters.map((c) => c.pokemon.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it("Weavile (base spe 125) は Garchomp (base spe 102) より速い", () => {
    const weavile = output.counters.find((c) => c.pokemon.name === "Weavile");
    expect(weavile?.speedCompare).toBe("faster");
  });
});

describe("find_counters Top N 廃止", () => {
  const LONG_RUN_TIMEOUT_MS = 60_000;
  it(
    "弱点タイプ攻撃技を覚える候補が 10 件を超える target では counters が 10 件を超える",
    async () => {
      const TOP_N_LEGACY = 10;
      const output = await callFindCounters({
        target: { name: "ガブリアス" },
      });
      expect(output.counters.length).toBeGreaterThan(TOP_N_LEGACY);
    },
    LONG_RUN_TIMEOUT_MS,
  );
});
