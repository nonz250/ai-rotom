/**
 * 技カテゴリ。priority-moves で再利用するため local に再定義している。
 * mcp-server の `MoveCategory` と同値。
 */
export type PriorityMoveCategory = "Physical" | "Special" | "Status";

/** 優先度が 0 の技はこのモジュールの対象外（先制技のみを扱う） */
const MIN_PRIORITY_FOR_INCLUSION = 1;

/**
 * 先制技の出力レコード。
 *
 * 技単位の静的 `priority` のみを反映する。
 * いたずらごころ・はやてのつばさ等、特性による priority 補正は含まない。
 */
export interface PriorityMoveInfo {
  move: string;
  moveJa: string;
  priority: number;
  category: PriorityMoveCategory;
}

/**
 * `extractPriorityMoves` が必要とする技情報の最小形。
 * shared は具象データに依存しないため、呼び出し側で MoveEntry 等から射影する。
 */
export interface MoveInfoForPriority {
  name: string;
  nameJa: string | null;
  priority: number;
  category: PriorityMoveCategory;
}

/**
 * learnset（技 ID の配列）から先制技のみを抽出し、priority 降順にソートして返す。
 *
 * - `priority >= 1` のみ対象
 * - ソート: priority 降順 → 英名昇順（安定化のための二次キー）
 * - `resolveMove` が undefined を返した ID は静かにスキップ（learnset と moves の
 *   不整合で対面分析が落ちるのを避ける防衛的実装）
 * - 日本語名は `resolveMove().nameJa` を優先し、null の場合は `toJapanese(enName)` に
 *   フォールバック。さらに未解決なら英名をそのまま返す
 *
 * 特性による priority 補正（いたずらごころ・はやてのつばさ等）はここでは扱わない。
 */
export function extractPriorityMoves(params: {
  learnsetMoveIds: readonly string[];
  resolveMove: (id: string) => MoveInfoForPriority | undefined;
  toJapanese: (enName: string) => string | undefined;
}): PriorityMoveInfo[] {
  const { learnsetMoveIds, resolveMove, toJapanese } = params;

  const results: PriorityMoveInfo[] = [];
  for (const id of learnsetMoveIds) {
    const move = resolveMove(id);
    if (move === undefined) {
      continue;
    }
    if (move.priority < MIN_PRIORITY_FOR_INCLUSION) {
      continue;
    }
    const moveJa = move.nameJa ?? toJapanese(move.name) ?? move.name;
    results.push({
      move: move.name,
      moveJa,
      priority: move.priority,
      category: move.category,
    });
  }

  results.sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    return a.move.localeCompare(b.move);
  });

  return results;
}
