import { MAX_MOVES_PER_MEMBER } from "@ai-rotom/shared";
import { CORE_INSTRUCTIONS } from "@ai-rotom/mcp-core";

/** リモート版でだけ渡す、パーティの保存先がないことの案内。 */
export const REMOTE_PARTY_INSTRUCTIONS = `
## リモート版での使い方

このサーバーはリモートで動いており、ローカル版と次の点が異なります。

### パーティの保存はできない

- パーティを保存・読み込みするツールはありません。
- ユーザーが示したパーティは会話の中で保持し、分析ツールを呼ぶたびに引数で渡すこと。
- ユーザーがポケソル形式や Showdown 形式のパーティのテキストを貼り付けた場合は、内容を読み取ってポケモン名・特性・持ち物・性格・SP・技に分け、分析ツールの引数にすること。
`.trim();

/** 自分側の技構成を必須にしたときだけ渡す、技構成の指定方法の案内。 */
export const REQUIRED_MOVES_INSTRUCTIONS = `
### 技構成を指定して計算する (必須)

- 1 回の呼び出しで使える処理時間に上限があり、習得技すべては計算できません。
- 次のツールでは、攻撃側の moves に実戦の技構成を必ず指定すること。指定しないとエラーになります。技は 1 体につき ${MAX_MOVES_PER_MEMBER} つまで指定できます。
  - calculate_damage_all_moves の attacker
  - calculate_damage_party_matchup の myParty の各メンバー
  - analyze_matchup の pokemon1
  - analyze_selection の myParty の各メンバー
- 自分側の技構成が分からない場合は、ユーザーに確認するか、get_learnset で覚える技を確認して主要な攻撃技を選んで指定すること。選んだ技構成はユーザーに伝えること。
- 相手側の技構成は必須ではありません。analyze_matchup の pokemon2 などは、技構成がわかっている場合だけ指定すること。
`.trim();

export function buildRemoteServerInstructions(requireMoves: boolean): string {
  const sections = [CORE_INSTRUCTIONS, REMOTE_PARTY_INSTRUCTIONS];
  if (requireMoves) {
    sections.push(REQUIRED_MOVES_INSTRUCTIONS);
  }
  return sections.join("\n\n");
}
