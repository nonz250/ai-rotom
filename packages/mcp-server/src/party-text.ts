import { parse, type PokesolTextParseReult } from "@pokesol/pokesol-text-parser-ts";
import type { EvsInput, PartyMember } from "@ai-rotom/shared";

/** ポケソルテキストで性格を省略した場合のデフォルト。 */
export const DEFAULT_NATURE_NAME = "まじめ";

/**
 * ポケソルテキストを空行区切りで個別ブロックに分割する。
 * 改行 (LF / CRLF) のどちらにも対応する。
 * 空白のみのブロックは除外する。
 */
export function splitPokesolTextBlocks(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n");
  return normalized
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
}

/**
 * 複数ポケモンのポケソルテキストを一括パースする。
 * いずれかのブロックが失敗した場合は、ブロック番号 (1-indexed) を
 * 付けたエラーで throw する (部分成功は許容しない)。
 */
export function parsePokesolTextMultiple(
  text: string,
): PokesolTextParseReult[] {
  const blocks = splitPokesolTextBlocks(text);
  const results: PokesolTextParseReult[] = [];
  blocks.forEach((block, index) => {
    try {
      results.push(parse(block));
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `ブロック ${index + 1} のパースに失敗しました: ${reason}`,
      );
    }
  });
  return results;
}

/**
 * パーサー出力 (`PokesolTextParseReult`) を `PartyMember` に変換する。
 * - `abilityNames[1]` (メガ前特性) が存在すればそれを `ability` として保存
 *   (通常状態の特性が基本。メガ進化時の特性変化は計算側の責務)
 * - `natureName` が null の場合は `DEFAULT_NATURE_NAME` で補完
 * - `terastalName` が存在する場合はポケチャン未対応のため無視
 * - `moveNames` が空配列の場合は `moves` フィールド自体を省く
 *
 * 補完・無視を行った場合はブロック番号付きの warnings を返す。
 */
export function mapPokesolResultToPartyMember(
  result: PokesolTextParseReult,
  blockNumber: number,
): { member: PartyMember; warnings: string[] } {
  const warnings: string[] = [];

  if (result.pokemonName === null || result.pokemonName === "") {
    throw new Error(
      `ブロック ${blockNumber}: ポケモン名が読み取れませんでした。`,
    );
  }

  const member: PartyMember = { name: result.pokemonName };

  if (result.itemName !== null) {
    member.item = result.itemName;
  }

  const [primaryAbility, preMegaAbility] = result.abilityNames;
  if (preMegaAbility !== undefined) {
    member.ability = preMegaAbility;
    if (primaryAbility !== undefined && primaryAbility !== preMegaAbility) {
      warnings.push(
        `ブロック ${blockNumber}: メガ進化特性「${primaryAbility}」は無視し、メガ前特性「${preMegaAbility}」を ability として保存しました。`,
      );
    }
  } else if (primaryAbility !== undefined) {
    member.ability = primaryAbility;
  }

  if (result.natureName !== null) {
    member.nature = result.natureName;
  } else {
    member.nature = DEFAULT_NATURE_NAME;
    warnings.push(
      `ブロック ${blockNumber}: 性格が省略されていたためデフォルト「${DEFAULT_NATURE_NAME}」を補完しました。`,
    );
  }

  if (result.terastalName !== null && result.terastalName !== "") {
    warnings.push(
      `ブロック ${blockNumber}: テラスタイプ「${result.terastalName}」はポケモンチャンピオンズ未対応のため無視しました。`,
    );
  }

  const evs = buildEvsFromResult(result.evs);
  if (evs !== undefined) {
    member.evs = evs;
  }

  if (result.moveNames.length > 0) {
    member.moves = [...result.moveNames];
  } else {
    warnings.push(
      `ブロック ${blockNumber}: 技行が省略されていたため moves を空で登録しました。`,
    );
  }

  return { member, warnings };
}

/**
 * パーサー出力の SP (努力値フィールド) を `EvsInput` に変換する。
 * 全て 0 の場合は undefined を返し、`PartyMember.evs` を省く。
 */
function buildEvsFromResult(
  parserEvs: PokesolTextParseReult["evs"],
): EvsInput | undefined {
  const mapped: EvsInput = {
    hp: parserEvs.hp,
    atk: parserEvs.attack,
    def: parserEvs.defense,
    spa: parserEvs.specialAttack,
    spd: parserEvs.specialDefense,
    spe: parserEvs.speed,
  };
  const hasAny = Object.values(mapped).some(
    (value) => value !== undefined && value !== 0,
  );
  return hasAny ? mapped : undefined;
}
