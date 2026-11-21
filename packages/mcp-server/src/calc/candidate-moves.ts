import { learnsetProvider, toDataId } from "../data-store.js";
import { damageCalculator } from "./damage-calculator.js";

/**
 * ポケモンが使う候補技の ID 一覧を返す。
 * 技構成の指定があればその技、なければ習得技すべて。
 */
export function candidateMoveIds(
  resolvedName: string,
  moves: readonly string[] | undefined,
): string[] {
  if (moves !== undefined && moves.length > 0) {
    return damageCalculator.resolveMoveNames(moves).map(toDataId);
  }
  return [...learnsetProvider.getMoveIds(resolvedName)];
}
