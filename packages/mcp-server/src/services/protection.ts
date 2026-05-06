import type {
  ConditionsInput,
  DamageCalcResult,
  DamageCalculatorAdapter,
  PokemonInput,
} from "@ai-rotom/shared";

/**
 * defender が持つ「1 発目を耐える効果」の累積判定。
 * マルチスケイル / ばけのかわ / きあいのタスキの 3 種を扱う。
 *
 * 単発 calculate_damage_single だけ見ると「マルスケ込み確 3 圏」と読んでしまうが、
 * 2 発目は通常計算になるので累積では確 2 になることが多い。この典型ミスを
 * 構造的に防ぐための共通関数。
 */

export type ProtectionType = "マルチスケイル" | "ばけのかわ" | "きあいのタスキ";

export interface ProtectionPlan {
  hasProtection: boolean;
  protectionType?: ProtectionType;
  /** 1 発目の挙動を表す注釈 (例: 「満タン時 1/2」) */
  firstHitNote?: string;
  /** 1 発目を完全無効化する (ばけのかわ) */
  firstHitNullified?: boolean;
  /** 1 発目で残せる HP の最大 % (タスキ = 99.9) */
  firstHitMaxResidualPct?: number;
  /** 2 発目以降の defender (ability/item を消費後仕様に書き換えたもの) */
  secondHitDefender?: PokemonInput;
}

export function planProtection(defender: PokemonInput): ProtectionPlan {
  const ability = defender.ability;
  const item = defender.item;

  if (ability === "マルチスケイル" || ability === "Multiscale") {
    return {
      hasProtection: true,
      protectionType: "マルチスケイル",
      firstHitNote: "満タン時 1/2",
      secondHitDefender: { ...defender, ability: "プレッシャー" },
    };
  }
  if (ability === "ばけのかわ" || ability === "Disguise") {
    return {
      hasProtection: true,
      protectionType: "ばけのかわ",
      firstHitNote: "完全無効 (1 発分吸収 + HP 1/8 減)",
      firstHitNullified: true,
      secondHitDefender: { ...defender, ability: "プレッシャー" },
    };
  }
  if (item === "きあいのタスキ" || item === "Focus Sash") {
    return {
      hasProtection: true,
      protectionType: "きあいのタスキ",
      firstHitNote: "満タン時 HP 1 残し",
      firstHitMaxResidualPct: 99.9,
      secondHitDefender: { ...defender, item: undefined },
    };
  }
  return { hasProtection: false };
}

export interface ProtectedDamageResult {
  /** 1 発目の素のダメ計結果 (smogon-calc 出力。ばけのかわ等の補正前) */
  firstHit: DamageCalcResult;
  /** 1 発目の実効ダメージレンジ % (保護効果反映後) */
  effRangeLabel?: string;
  effMin?: number;
  effMax?: number;
  /** 2 発目のダメ計結果 (保護効果消費後の defender) */
  secondHit?: DamageCalcResult;
  /** 累積 % と KO 判定 */
  accumulated?: {
    range: string;
    ko: "確定2発" | "乱数2発" | "確2圏外 (3発以上必要)";
    minPct: number;
    maxPct: number;
  };
  /** 検出された保護効果の種類と注釈 (なければ undefined) */
  protection?: { type: ProtectionType; firstHitNote: string };
}

/**
 * 1 発目 + 2 発目 + 累積判定をまとめて行う。
 * 保護効果がなければ firstHit のみ、無効技 (typeMultiplier=0) なら firstHit のみ。
 */
export function calculateWithProtection(
  calculator: DamageCalculatorAdapter,
  attacker: PokemonInput,
  defender: PokemonInput,
  moveName: string,
  conditions?: ConditionsInput,
): ProtectedDamageResult {
  const r1 = calculator.calculate({ attacker, defender, moveName, conditions });
  if (r1.typeMultiplier === 0) {
    return { firstHit: r1 };
  }
  const plan = planProtection(defender);
  if (!plan.hasProtection || !plan.secondHitDefender) {
    return { firstHit: r1 };
  }

  const r2 = calculator.calculate({
    attacker,
    defender: plan.secondHitDefender,
    moveName,
    conditions,
  });

  let effMin: number;
  let effMax: number;
  let effRangeLabel: string;
  if (plan.firstHitNullified) {
    effMin = 0;
    effMax = 0;
    effRangeLabel = "無効 (ばけのかわで吸収)";
  } else if (plan.firstHitMaxResidualPct !== undefined) {
    const cap = plan.firstHitMaxResidualPct;
    effMin = Math.min(r1.minPercent, cap);
    effMax = Math.min(r1.maxPercent, cap);
    effRangeLabel =
      r1.minPercent >= 100
        ? `${cap.toFixed(1)}% (タスキで HP 1 残し)`
        : `${effMin.toFixed(1)}-${effMax.toFixed(1)}%`;
  } else {
    effMin = r1.minPercent;
    effMax = r1.maxPercent;
    effRangeLabel = `${effMin.toFixed(1)}-${effMax.toFixed(1)}% (マルスケ込み)`;
  }

  const accMin = effMin + r2.minPercent;
  const accMax = effMax + r2.maxPercent;
  const accKO: ProtectedDamageResult["accumulated"] extends infer T
    ? T extends { ko: infer K }
      ? K
      : never
    : never =
    accMin >= 100
      ? "確定2発"
      : accMax >= 100
        ? "乱数2発"
        : "確2圏外 (3発以上必要)";

  return {
    firstHit: r1,
    secondHit: r2,
    protection: {
      type: plan.protectionType!,
      firstHitNote: plan.firstHitNote!,
    },
    effRangeLabel,
    effMin,
    effMax,
    accumulated: {
      range: `${accMin.toFixed(1)}-${accMax.toFixed(1)}%`,
      ko: accKO,
      minPct: accMin,
      maxPct: accMax,
    },
  };
}
