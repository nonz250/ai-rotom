import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Generations } from "@smogon/calc";
import type { TypeName } from "@smogon/calc";
import {
  DamageCalculatorAdapter,
  calculateTypeEffectiveness,
  pokemonSchema,
} from "@ai-rotom/shared";
import {
  abilitiesById,
  itemsById,
  movesById,
  pokemonById,
  pokemonEntryProvider,
  toDataId,
} from "../../data-store.js";
import {
  abilityNameResolver,
  itemNameResolver,
  moveNameResolver,
  natureNameResolver,
  pokemonNameResolver,
} from "../../name-resolvers.js";
import { fetchPokemonMeta, fetchTypicalSet } from "../../services/pokedb-client.js";
import { toErrorResponse, withHint } from "../../tool-response-hint.js";

const TOOL_NAME = "verify_claims";
const TOOL_DESCRIPTION =
  "ドラフト中の主張を機械検証する Phase 2 用ツール。typing / damage / ability / item / move / typical / partner / mega-typing / status-immunity の 9 種を扱う。各 claim を構造化 JSON で渡すと、タイプ相性倍率・採用率・ダメージ % などの実データと突合して mismatch を返す。Phase 1.5 のセルフレビューで挙げた verifyClaim をまとめてここに投げる。";

const TOLERANCE_PCT = 2.0;
const gen = Generations.get(0);

type ClaimType =
  | "typing"
  | "damage"
  | "ability"
  | "item"
  | "move"
  | "typical"
  | "partner"
  | "mega-typing"
  | "status-immunity";

const claimSchema = z
  .object({
    type: z.string(),
  })
  .passthrough();

const inputSchema = {
  claims: z
    .array(claimSchema)
    .describe(
      "検証する主張の配列。各要素は { type: '...', ... } 形式 (type ごとに必要なフィールドが変わる、詳細は description 参照)",
    ),
};

interface VerifyResult {
  ok: boolean | null;
  fact?: Record<string, unknown>;
  mismatch?: string | null;
  note?: string;
}

const TYPE_LABEL = (mult: number): string => {
  if (mult === 0) return "無効";
  if (mult === 4) return "4倍弱点";
  if (mult === 2) return "2倍弱点";
  if (mult === 1) return "等倍";
  if (mult === 0.5) return "半減";
  if (mult === 0.25) return "1/4";
  return `${mult}x`;
};

function resolvePokemonTypes(jaOrEn: string): {
  types: TypeName[];
  nameJa: string | null;
  nameEn: string;
} | null {
  const en =
    pokemonNameResolver.toEnglish(jaOrEn) ??
    (pokemonNameResolver.hasEnglishName(jaOrEn) ? jaOrEn : null);
  if (!en) return null;
  const entry = pokemonById.get(toDataId(en));
  if (!entry) return null;
  return {
    types: entry.types as TypeName[],
    nameJa: entry.nameJa,
    nameEn: entry.name,
  };
}

function verifyTyping(c: Record<string, unknown>): VerifyResult {
  const poke = c.poke as string;
  const moveType = c.moveType as TypeName;
  const claim = c.claim as string;
  const resolved = resolvePokemonTypes(poke);
  if (!resolved) return { ok: false, mismatch: `ポケモン「${poke}」が見つかりません` };
  const mult = calculateTypeEffectiveness(gen, moveType, resolved.types);
  const actualLabel = TYPE_LABEL(mult);
  const ok = actualLabel === claim;
  return {
    ok,
    fact: { types: resolved.types, mult, label: actualLabel },
    mismatch: ok
      ? null
      : `claim「${claim}」 vs 実際「${actualLabel}」(${moveType} → ${resolved.types.join("/")} = ${mult}x)`,
  };
}

function createCalculator(): DamageCalculatorAdapter {
  return new DamageCalculatorAdapter(
    {
      pokemon: pokemonNameResolver,
      move: moveNameResolver,
      ability: abilityNameResolver,
      item: itemNameResolver,
      nature: natureNameResolver,
    },
    pokemonEntryProvider,
  );
}

const calculator = createCalculator();

function verifyDamage(c: Record<string, unknown>): VerifyResult {
  const result = calculator.calculate({
    attacker: c.attacker as never,
    defender: c.defender as never,
    moveName: c.move as string,
  });
  const actualRange =
    result.typeMultiplier === 0
      ? "無効"
      : `${result.minPercent.toFixed(1)}-${result.maxPercent.toFixed(1)}%`;

  const mismatches: string[] = [];
  if (typeof c.claimedRange === "string") {
    const cm = c.claimedRange.match(/([\d.]+)\s*-\s*([\d.]+)/);
    if (cm) {
      const cMin = parseFloat(cm[1]!);
      const cMax = parseFloat(cm[2]!);
      if (result.typeMultiplier === 0) {
        mismatches.push(`claim「${c.claimedRange}」だが実際は無効 (タイプ相性 0倍)`);
      } else if (
        Math.abs(cMin - result.minPercent) > TOLERANCE_PCT ||
        Math.abs(cMax - result.maxPercent) > TOLERANCE_PCT
      ) {
        mismatches.push(`claimedRange ${c.claimedRange} vs 実際 ${actualRange}`);
      }
    }
  }
  if (typeof c.claimedKO === "string" && c.claimedKO !== result.koChance) {
    mismatches.push(`claimedKO「${c.claimedKO}」 vs 実際「${result.koChance}」`);
  }
  return {
    ok: mismatches.length === 0,
    fact: {
      range: actualRange,
      ko: result.koChance,
      typeMult: result.typeMultiplier,
    },
    mismatch: mismatches.length > 0 ? mismatches.join("; ") : null,
  };
}

function verifyAbility(c: Record<string, unknown>): VerifyResult {
  const name = c.name as string;
  const en =
    abilityNameResolver.toEnglish(name) ??
    (abilityNameResolver.hasEnglishName(name) ? name : null);
  if (!en) return { ok: false, mismatch: `特性「${name}」が見つかりません` };
  const entry = abilitiesById.get(toDataId(en));
  if (!entry) return { ok: false, mismatch: `特性「${name}」は Champions に存在しない可能性` };
  return {
    ok: null,
    fact: { name: entry.name, nameJa: entry.nameJa, desc: entry.desc, shortDesc: entry.shortDesc },
    note: `claim「${c.claim ?? ""}」を fact.desc と照合してください`,
  };
}

function verifyItem(c: Record<string, unknown>): VerifyResult {
  const name = c.name as string;
  const en =
    itemNameResolver.toEnglish(name) ??
    (itemNameResolver.hasEnglishName(name) ? name : null);
  if (!en) {
    return {
      ok: false,
      fact: { name },
      mismatch: `「${name}」は Champions に存在しない可能性 (辞書未登録)。命の珠 / こだわりハチマキ / とつげきチョッキ等は廃止`,
    };
  }
  const entry = itemsById.get(toDataId(en));
  if (!entry) {
    return {
      ok: false,
      fact: { name },
      mismatch: `「${name}」は Champions に存在しない可能性`,
    };
  }
  return {
    ok: null,
    fact: { name: entry.name, nameJa: entry.nameJa, desc: entry.desc },
    note: `claim「${c.claim ?? ""}」を fact.desc と照合してください`,
  };
}

function verifyMove(c: Record<string, unknown>): VerifyResult {
  const name = c.name as string;
  const en =
    moveNameResolver.toEnglish(name) ??
    (moveNameResolver.hasEnglishName(name) ? name : null);
  if (!en) return { ok: false, mismatch: `技「${name}」が見つかりません` };
  const entry = movesById.get(toDataId(en));
  if (!entry) return { ok: false, mismatch: `技「${name}」は Champions に存在しない可能性` };
  const claim = (c.claim ?? {}) as { type?: string; bp?: number; category?: string };
  const mismatches: string[] = [];
  if (claim.type && claim.type !== entry.type) {
    mismatches.push(`type: claim「${claim.type}」 vs 実際「${entry.type}」`);
  }
  if (claim.bp !== undefined && claim.bp !== entry.basePower) {
    mismatches.push(`威力: claim「${claim.bp}」 vs 実際「${entry.basePower}」`);
  }
  if (claim.category && claim.category !== entry.category) {
    mismatches.push(`カテゴリ: claim「${claim.category}」 vs 実際「${entry.category}」`);
  }
  return {
    ok: mismatches.length === 0,
    fact: { name: entry.name, nameJa: entry.nameJa, type: entry.type, bp: entry.basePower, category: entry.category },
    mismatch: mismatches.length > 0 ? mismatches.join("; ") : null,
  };
}

async function verifyTypical(c: Record<string, unknown>): Promise<VerifyResult> {
  const poke = c.poke as string;
  const claim = (c.claim ?? {}) as {
    topMove?: string;
    topAbility?: string;
    topItem?: string;
    topNature?: string;
    hasMove?: string;
  };
  const [typical, meta] = await Promise.all([fetchTypicalSet(poke), fetchPokemonMeta(poke)]);
  const mismatches: string[] = [];
  if (claim.topMove) {
    const top = meta.moves[0];
    if (!top || top.name !== claim.topMove) {
      mismatches.push(
        `topMove: claim「${claim.topMove}」 vs 実際「${top ? `${top.name}(${top.percentage}%)` : "なし"}」`,
      );
    }
  }
  if (claim.topAbility) {
    const top = meta.abilities[0];
    if (!top || top.name !== claim.topAbility) {
      mismatches.push(
        `topAbility: claim「${claim.topAbility}」 vs 実際「${top ? top.name : "なし"}」`,
      );
    }
  }
  if (claim.topItem) {
    const top = meta.items[0];
    if (!top || top.name !== claim.topItem) {
      mismatches.push(
        `topItem: claim「${claim.topItem}」 vs 実際「${top ? top.name : "なし"}」`,
      );
    }
  }
  if (claim.topNature) {
    const top = meta.natures[0];
    if (!top || top.name !== claim.topNature) {
      mismatches.push(
        `topNature: claim「${claim.topNature}」 vs 実際「${top ? top.name : "なし"}」`,
      );
    }
  }
  if (claim.hasMove) {
    const found = meta.moves.find((m) => m.name === claim.hasMove);
    if (!found) mismatches.push(`hasMove: claim「${claim.hasMove}」採用率不明 (圏外)`);
  }
  return {
    ok: mismatches.length === 0,
    fact: {
      summary: typical.summary,
      topMoves: meta.moves.slice(0, 5).map((x) => `${x.name}(${x.percentage}%)`),
      topAbility: typical.ability,
      topItems: typical.topItems.slice(0, 3),
    },
    mismatch: mismatches.length > 0 ? mismatches.join("; ") : null,
  };
}

async function verifyPartner(c: Record<string, unknown>): Promise<VerifyResult> {
  const poke = c.poke as string;
  const withName = c.with as string;
  const meta = await fetchPokemonMeta(poke);
  const partner = meta.partners.find((p) => p.name === withName);
  if (!partner) {
    return {
      ok: false,
      fact: {
        topPartners: meta.partners.slice(0, 5).map((p) => `${p.rank}位 ${p.name}`),
      },
      mismatch: `「${withName}」は ${poke} の partners 上位に出てこない`,
    };
  }
  return {
    ok: null,
    fact: { partnerRank: partner.rank },
    note: `${poke} と ${withName} の並び実績は ${partner.rank} 位 (pokedb partners、% は元データに非掲載)`,
  };
}

function verifyMegaTyping(c: Record<string, unknown>): VerifyResult {
  const poke = c.poke as string;
  const moveType = c.moveType as TypeName;
  const claim = c.claim as string;
  const resolved = resolvePokemonTypes(poke);
  if (!resolved) return { ok: false, mismatch: `ポケモン「${poke}」が見つかりません` };
  const mult = calculateTypeEffectiveness(gen, moveType, resolved.types);
  const actualLabel = TYPE_LABEL(mult);

  // メガ前 (baseSpecies) の倍率も計算 (差分提示)
  const entry = pokemonById.get(toDataId(resolved.nameEn));
  let beforeMult: number | null = null;
  if (entry?.baseSpecies) {
    const baseEntry = pokemonById.get(toDataId(entry.baseSpecies));
    if (baseEntry) {
      beforeMult = calculateTypeEffectiveness(gen, moveType, baseEntry.types as TypeName[]);
    }
  }
  const ok = actualLabel === claim;
  return {
    ok,
    fact: {
      types: resolved.types,
      multAfterMega: mult,
      labelAfterMega: actualLabel,
      multBeforeMega: beforeMult,
      changed: beforeMult !== null && beforeMult !== mult,
    },
    mismatch: ok
      ? null
      : `claim「${claim}」 vs 実際「${actualLabel}」(メガ後 ${resolved.types.join("/")})。メガ前は ${beforeMult ?? "?"}x`,
  };
}

function verifyStatusImmunity(c: Record<string, unknown>): VerifyResult {
  const poke = c.poke as string;
  const status = c.status as string;
  const claim = (c.claim as string) ?? "";
  const resolved = resolvePokemonTypes(poke);
  if (!resolved) return { ok: false, mismatch: `ポケモン「${poke}」が見つかりません` };
  const types = resolved.types;
  let immune = false;
  let reason = "";
  switch (status) {
    case "burn":
      if (types.includes("Fire" as TypeName)) {
        immune = true;
        reason = "Fireタイプ";
      }
      break;
    case "paralysis":
      if (types.includes("Electric" as TypeName)) {
        immune = true;
        reason = "Electricタイプ";
      }
      break;
    case "freeze":
      if (types.includes("Ice" as TypeName)) {
        immune = true;
        reason = "Iceタイプ";
      }
      break;
    case "sleep":
      if (types.includes("Grass" as TypeName)) {
        immune = true;
        reason = "Grassタイプ (粉技のみ)";
      }
      break;
    case "poison":
      if (types.includes("Steel" as TypeName) || types.includes("Poison" as TypeName)) {
        immune = true;
        reason = "Steel/Poisonタイプ";
      }
      break;
  }
  const claimedImmune = /(?:しない|ない|無効|つかない|入らない)/.test(claim);
  const ok = immune === claimedImmune;
  return {
    ok,
    fact: { types, statusImmune: immune, reason: reason || "タイプ由来の無効ではない" },
    mismatch: ok
      ? null
      : `claim「${claim}」 vs 実際: ${types.join("/")} は ${status} ${immune ? "無効" : "する"} (${reason || "タイプ由来の無効ではない"})`,
  };
}

async function verifyOne(claim: Record<string, unknown>): Promise<VerifyResult> {
  const type = claim.type as ClaimType;
  switch (type) {
    case "typing":
      return verifyTyping(claim);
    case "damage":
      return verifyDamage(claim);
    case "ability":
      return verifyAbility(claim);
    case "item":
      return verifyItem(claim);
    case "move":
      return verifyMove(claim);
    case "typical":
      return verifyTypical(claim);
    case "partner":
      return verifyPartner(claim);
    case "mega-typing":
      return verifyMegaTyping(claim);
    case "status-immunity":
      return verifyStatusImmunity(claim);
    default:
      return { ok: false, mismatch: `unknown type: ${type}` };
  }
}

// pokemonSchema は型補完のために import (verifyDamage で使う) が、参照だけ。
void pokemonSchema;

export function registerVerifyClaimsTool(server: McpServer): void {
  server.tool(TOOL_NAME, TOOL_DESCRIPTION, inputSchema, async (args) => {
    try {
      const out: { claim: Record<string, unknown>; result: VerifyResult }[] = [];
      for (const c of args.claims as Record<string, unknown>[]) {
        try {
          const r = await verifyOne(c);
          out.push({ claim: c, result: r });
        } catch (e) {
          out.push({
            claim: c,
            result: {
              ok: false,
              mismatch: `verify error: ${(e as Error).message}`,
            },
          });
        }
      }
      return withHint({ type: "text" as const, text: JSON.stringify(out) });
    } catch (error) {
      return toErrorResponse(error);
    }
  });
}
