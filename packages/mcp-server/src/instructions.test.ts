import { describe, it, expect } from "vitest";
import {
  MAX_STAT_POINT_PER_STAT,
  MAX_STAT_POINT_TOTAL,
} from "@ai-rotom/shared";
import { SERVER_INSTRUCTIONS } from "./instructions";

describe("SERVER_INSTRUCTIONS", () => {
  it("includes the per-stat stat point upper bound", () => {
    expect(SERVER_INSTRUCTIONS).toContain(String(MAX_STAT_POINT_PER_STAT));
  });

  it("includes the total stat point upper bound", () => {
    expect(SERVER_INSTRUCTIONS).toContain(String(MAX_STAT_POINT_TOTAL));
  });

  it("mentions the former EV naming so clients learn the spec change", () => {
    // AI クライアントが旧仕様 (EV/252/510) を流用しないよう、
    // instructions で明示的に旧名称との差異を伝えるという設計意図を固定化する。
    expect(SERVER_INSTRUCTIONS).toContain("EV");
    expect(SERVER_INSTRUCTIONS).toContain("252");
  });

  it("documents IV is fixed to 31", () => {
    expect(SERVER_INSTRUCTIONS).toContain("個体値");
    expect(SERVER_INSTRUCTIONS).toContain("31");
  });

  it("documents battle level 50", () => {
    expect(SERVER_INSTRUCTIONS).toContain("レベル");
    expect(SERVER_INSTRUCTIONS).toContain("50");
  });

  it("documents mega evolution once per battle", () => {
    expect(SERVER_INSTRUCTIONS).toContain("メガシンカ");
  });

  it("documents terastal not supported", () => {
    expect(SERVER_INSTRUCTIONS).toContain("テラスタル");
  });

  it("declares the session-wide scope as Pokemon Champions", () => {
    // セッション内のポケモン話題全般をポケチャン仕様として扱わせる
    // スコープ宣言が先頭付近に存在することを保証する。
    expect(SERVER_INSTRUCTIONS).toContain("セッションスコープ");
    expect(SERVER_INSTRUCTIONS).toContain("ポケモンチャンピオンズ");
    const scopeIndex = SERVER_INSTRUCTIONS.indexOf("セッションスコープ");
    const specsIndex = SERVER_INSTRUCTIONS.indexOf("能力ポイント");
    // スコープ宣言は個別仕様の説明より前に配置する設計。
    expect(scopeIndex).toBeGreaterThan(-1);
    expect(scopeIndex).toBeLessThan(specsIndex);
  });

  it("tells clients not to rely on legacy title knowledge", () => {
    // 従来作の知識を前提にしない方針を明示する。
    // タイトル名は代表例として「SV」を固定化する（網羅チェックではなく方針の固定化）。
    expect(SERVER_INSTRUCTIONS).toContain("従来作");
    expect(SERVER_INSTRUCTIONS).toContain("SV");
    expect(SERVER_INSTRUCTIONS).toContain("前提にしない");
  });

  it("instructs clients to verify with info tools before answering", () => {
    // 従来作との差異が出得る項目はツールで事実確認させるという設計意図を固定化する。
    expect(SERVER_INSTRUCTIONS).toContain("get_pokemon_info");
    expect(SERVER_INSTRUCTIONS).toContain("get_move_info");
    expect(SERVER_INSTRUCTIONS).toContain("get_ability_info");
    expect(SERVER_INSTRUCTIONS).toContain("事実確認");
  });

  it("forbids filling in unknowns by guessing", () => {
    // ポケチャン固有仕様の不明点を推測で埋めさせない方針を固定化する。
    expect(SERVER_INSTRUCTIONS).toContain("推測");
    expect(SERVER_INSTRUCTIONS).toContain("ユーザーに確認");
  });

  it("recommends specifying ability and item for calc / analysis tools", () => {
    // 計算・対面分析系ツールで ability / item の指定を推奨する方針を
    // instructions に明示し、AI クライアントが省略しがちな挙動を抑止する意図を固定化する。
    expect(SERVER_INSTRUCTIONS).toContain("ability");
    expect(SERVER_INSTRUCTIONS).toContain("item");
    expect(SERVER_INSTRUCTIONS).toContain("推奨");
  });

  it("no longer lists ability in the list of omissible fields", () => {
    // 旧表現「evs・nature・ability 等を省略してよい」から ability を外し、
    // evs / nature のみ省略許容であることを保証する。
    expect(SERVER_INSTRUCTIONS).not.toContain("evs・nature・ability");
    // リファクタで省略可フィールドの表記が消えてしまわないよう正の検証も併記する。
    expect(SERVER_INSTRUCTIONS).toContain("evs・nature");
  });

  it("declares the responsibility split between tools and AI", () => {
    // ツールは判断の根拠データを返すのみで、最終判断は返さないという
    // 責務分担の方針を instructions に固定化する。
    expect(SERVER_INSTRUCTIONS).toContain("## 判断と計算の役割分担");
    expect(SERVER_INSTRUCTIONS).toContain("最終判断は返しません");
  });

  it("describes scored candidate lists as only a rough guide", () => {
    // find_counters 等のスコア付きリストはあくまで候補抽出の目安であり、
    // 最終採用は AI が総合判断する旨を instructions に固定化する。
    expect(SERVER_INSTRUCTIONS).toContain("候補抽出のための目安");
  });

  it("places the responsibility split section before the usage recommendations", () => {
    // 「判断と計算の役割分担」は使い方ガイドより前に提示する設計。
    // 先に責務分担を伝えた上で具体的な使い方に進める順序を固定化する。
    const responsibilityIndex = SERVER_INSTRUCTIONS.indexOf(
      "## 判断と計算の役割分担",
    );
    const usageIndex = SERVER_INSTRUCTIONS.indexOf("## ツール利用方針（必須）");
    expect(responsibilityIndex).toBeGreaterThan(-1);
    expect(usageIndex).toBeGreaterThan(-1);
    expect(responsibilityIndex).toBeLessThan(usageIndex);
  });

  it("keeps the champions-specific spec block intact before the responsibility split", () => {
    // 「能力ポイント (SP)」から始まる固有仕様ブロックを、
    // 「判断と計算の役割分担」の挿入で分断しないことを固定化する。
    const statPointsIndex = SERVER_INSTRUCTIONS.indexOf(
      "## 能力ポイント (SP) について",
    );
    const responsibilityIndex = SERVER_INSTRUCTIONS.indexOf(
      "## 判断と計算の役割分担",
    );
    expect(statPointsIndex).toBeGreaterThan(-1);
    expect(responsibilityIndex).toBeGreaterThan(-1);
    expect(statPointsIndex).toBeLessThan(responsibilityIndex);
  });

  it("guides clients to call list_parties at session start", () => {
    // セッション開始時に保存済みパーティの名前一覧を把握させるため、
    // list_parties を呼ぶ誘導が instructions に存在することを固定化する。
    expect(SERVER_INSTRUCTIONS).toContain("## パーティデータの扱い");
    expect(SERVER_INSTRUCTIONS).toContain("セッション開始時");
    expect(SERVER_INSTRUCTIONS).toContain("list_parties");
  });

  it("guides clients to load full details only on demand", () => {
    // 起動時の詳細自動読み込みを禁止し、ユーザーの言及時に load_party で
    // 詳細を取得する運用を固定化する (トークン消費抑制)。
    expect(SERVER_INSTRUCTIONS).toContain("load_party");
    expect(SERVER_INSTRUCTIONS).toContain("トークン消費");
  });

  it("guides clients to confirm before save_party and delete_party", () => {
    // ユーザー同意なしに save_party / delete_party を呼ばせない方針を
    // instructions に固定化する。
    expect(SERVER_INSTRUCTIONS).toContain("save_party");
    expect(SERVER_INSTRUCTIONS).toContain("delete_party");
    expect(SERVER_INSTRUCTIONS).toContain("確認");
  });

  it("places party data section after existing usage guidance", () => {
    // 既存の固有仕様・使い方ガイドの後ろに「パーティデータの扱い」を
    // 追加する設計順序を固定化する。
    const usageIndex = SERVER_INSTRUCTIONS.indexOf("## ツール利用方針（必須）");
    const partyIndex = SERVER_INSTRUCTIONS.indexOf("## パーティデータの扱い");
    expect(usageIndex).toBeGreaterThan(-1);
    expect(partyIndex).toBeGreaterThan(-1);
    expect(usageIndex).toBeLessThan(partyIndex);
  });

  it("forbids answering pokemon facts from memory before calling a tool", () => {
    // ポケモン名・技名・特性・素早さ等の固有名詞や数値が話題に出た時点で
    // ツールを呼ばせる方針を instructions に固定化する (記憶ベースで即答しない)。
    expect(SERVER_INSTRUCTIONS).toContain(
      "まず本サーバーのツールを呼んで事実を取得してから回答すること",
    );
    expect(SERVER_INSTRUCTIONS).toContain("記憶");
  });

  it("guides search-style pokemon questions to the search tools", () => {
    // 「○○ってどんなポケモン？」「条件で絞り込み」等の検索話題を
    // search_pokemon 系ツールに明示的にルーティングする設計を固定化する。
    // サブセクションヘッダ自体を直接検証して位置をピンポイントで固定する。
    expect(SERVER_INSTRUCTIONS).toContain("### ポケモン検索・情報取得");
    expect(SERVER_INSTRUCTIONS).toContain("search_pokemon");
    expect(SERVER_INSTRUCTIONS).toContain("search_pokemon_by_move");
    expect(SERVER_INSTRUCTIONS).toContain("search_pokemon_by_ability");
    expect(SERVER_INSTRUCTIONS).toContain(
      "search_pokemon_by_type_effectiveness",
    );
  });

  it("guides attack / move questions to the move and damage tools", () => {
    // 技・攻撃・攻撃範囲の話題を get_move_info / analyze_party_coverage /
    // calculate_damage_* に集約する設計意図を固定化する。
    expect(SERVER_INSTRUCTIONS).toContain("### 技・攻撃まわり");
    expect(SERVER_INSTRUCTIONS).toContain("analyze_party_coverage");
    expect(SERVER_INSTRUCTIONS).toContain("calculate_damage_all_moves");
  });

  it("guides speed-tier questions to the speed tools", () => {
    // 素早さ (S ライン) の話題を calculate_stats / list_speed_tiers /
    // analyze_matchup にルーティングする設計を固定化する。
    expect(SERVER_INSTRUCTIONS).toContain("### 素早さ (S ライン)");
    expect(SERVER_INSTRUCTIONS).toContain("list_speed_tiers");
    expect(SERVER_INSTRUCTIONS).toContain("calculate_stats");
  });

  it("guides the interactive party registration workflow", () => {
    // テキスト貼付できないユーザー向けに、AI が段階的ヒアリングを行う
    // 対話スタイルを instructions で誘導する設計意図を固定化する。
    expect(SERVER_INSTRUCTIONS).toContain("パーティ登録の対話スタイル");
    expect(SERVER_INSTRUCTIONS).toContain("ケース A");
    expect(SERVER_INSTRUCTIONS).toContain("ケース B");
  });

  it("routes pasted text / screenshot cases through import_party_from_text", () => {
    // テキスト貼付・スクショ添付いずれも同じツールに集約する方針を固定化する。
    expect(SERVER_INSTRUCTIONS).toContain("import_party_from_text");
    expect(SERVER_INSTRUCTIONS).toContain("ポケソルテキスト");
    expect(SERVER_INSTRUCTIONS).toContain("スクショ");
  });

  it("mandates pokesol-text confirmation step before import", () => {
    // ハルシネーション対策として、対話結果をポケソルテキスト形式に整理し、
    // ユーザー確認を取ってから import を呼ぶフローを固定化する。
    expect(SERVER_INSTRUCTIONS).toContain("整理ステップ");
    expect(SERVER_INSTRUCTIONS).toContain("ユーザーに確認");
    expect(SERVER_INSTRUCTIONS).toContain("calculate_stats");
  });

  it("forbids direct save_party with AI-constructed JSON", () => {
    // B-1 方式 (JSON を組み立てて save_party に直接渡す) を明示的に禁止する
    // 設計意図を固定化する。
    expect(SERVER_INSTRUCTIONS).toContain("save_party を直接呼ばない");
    expect(SERVER_INSTRUCTIONS).toContain("ユーザー確認なしに save / import を実行しない");
  });

  it("lists the ordered fields to collect during interactive hearing", () => {
    // 1 匹あたりのヒアリング順序 (名前 → 性格 → 特性 → もちもの → 技 → SP) を
    // instructions で明示する設計意図を固定化する。
    expect(SERVER_INSTRUCTIONS).toContain("ポケモン名");
    expect(SERVER_INSTRUCTIONS).toContain("性格");
    expect(SERVER_INSTRUCTIONS).toContain("特性");
    expect(SERVER_INSTRUCTIONS).toContain("もちもの");
    expect(SERVER_INSTRUCTIONS).toContain("SP 配分");
  });

  it("keeps SP range in the interactive guide aligned with constants", () => {
    // 対話中に SP 範囲を提示する箇所がマジックナンバー化せず、
    // 既存定数 (MAX_STAT_POINT_PER_STAT / MAX_STAT_POINT_TOTAL) と整合することを保証する。
    expect(SERVER_INSTRUCTIONS).toContain(
      `各 0〜${MAX_STAT_POINT_PER_STAT} / 合計 0〜${MAX_STAT_POINT_TOTAL}`,
    );
  });
});
