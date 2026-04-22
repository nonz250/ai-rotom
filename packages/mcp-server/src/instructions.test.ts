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
  });

  it("directs clients to call list_parties at session start", () => {
    // 起動時に保存済みパーティの名前一覧を把握させるため、
    // 初回ユーザー発話への応答前に list_parties を呼ばせる誘導を固定化する。
    expect(SERVER_INSTRUCTIONS).toContain("セッション開始時");
    expect(SERVER_INSTRUCTIONS).toContain("list_parties");
  });

  it("directs clients to call load_party when users mention a saved party name", () => {
    // ユーザーが保存名に言及した時点で詳細を都度取得させる方針を固定化する。
    expect(SERVER_INSTRUCTIONS).toContain("load_party");
  });

  it("directs clients to confirm before save_party on new builds", () => {
    // 新規構築時にユーザー同意を取ってから save_party を呼ぶ方針を固定化する。
    expect(SERVER_INSTRUCTIONS).toContain("save_party");
    expect(SERVER_INSTRUCTIONS).toContain("保存しますか");
  });

  it("mentions delete_party for deletion requests", () => {
    // 削除依頼は delete_party を使う旨を明示する。
    expect(SERVER_INSTRUCTIONS).toContain("delete_party");
  });

  it("forbids auto-loading full party details at startup to save tokens", () => {
    // 起動時に全パーティ詳細を自動読み込みしない方針 (トークン消費抑制) を固定化する。
    expect(SERVER_INSTRUCTIONS).toContain("トークン消費");
    expect(SERVER_INSTRUCTIONS).toContain("自動読み込み");
  });

  it("places the party section at the end, after existing sections", () => {
    // 既存セクション (ability/item 指定) の後にパーティセクションが追加される
    // という配置設計を固定化する。
    const abilityItemIndex = SERVER_INSTRUCTIONS.indexOf(
      "計算・分析系ツールでの ability / item 指定",
    );
    const partyIndex = SERVER_INSTRUCTIONS.indexOf("パーティデータの扱い");
    expect(abilityItemIndex).toBeGreaterThan(-1);
    expect(partyIndex).toBeGreaterThan(abilityItemIndex);
  });
});
