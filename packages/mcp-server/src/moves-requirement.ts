import { MAX_MOVES_PER_MEMBER } from "@ai-rotom/shared";

/** 全技系ツールで、攻撃側の技構成を必須にするかどうか。 */
export interface MovesRequirement {
  requireMoves: boolean;
}

export const MOVES_OPTIONAL: MovesRequirement = { requireMoves: false };

export interface MovesTarget {
  /** エラーメッセージで指す引数の位置。例: "attacker"、"myParty[0]" */
  field: string;
  name: string;
  moves?: readonly string[];
}

/**
 * 技構成が必須の環境で、moves を指定していない攻撃側があればエラーにする。
 * 習得技すべてを計算すると、実行環境の処理時間の上限を超えるため。
 */
export function assertMovesSpecified(
  requirement: MovesRequirement,
  targets: readonly MovesTarget[],
): void {
  if (!requirement.requireMoves) {
    return;
  }
  const missing = targets.filter((target) => (target.moves?.length ?? 0) === 0);
  if (missing.length === 0) {
    return;
  }
  const list = missing.map((target) => `${target.field} (${target.name})`).join("、");
  throw new Error(
    `このサーバーは 1 回の処理時間に上限があるため、技構成の指定が必要です。${list} の moves に技構成を指定して呼び直してください。技は ${MAX_MOVES_PER_MEMBER} つまで指定できます。技構成が分からない場合は get_learnset で覚える技を確認して選んでください。`,
  );
}
