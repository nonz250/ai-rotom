import { describe, expect, it } from "vitest";
import {
  DEFAULT_NATURE_NAME,
  mapPokesolResultToPartyMember,
  parsePokesolTextMultiple,
  splitPokesolTextBlocks,
} from "./party-text.js";

describe("splitPokesolTextBlocks", () => {
  it("空行で複数ブロックに分割する", () => {
    const text = `ガブリアス @ こだわりスカーフ
特性: さめはだ
能力補正: いじっぱり

ギャラドス @ たつじんのおび
特性: いかく
能力補正: ようき`;
    expect(splitPokesolTextBlocks(text)).toHaveLength(2);
  });

  it("CRLF 改行コードにも対応する", () => {
    const text =
      "ガブリアス\r\n特性: さめはだ\r\n能力補正: いじっぱり\r\n\r\nギャラドス\r\n特性: いかく\r\n能力補正: ようき";
    expect(splitPokesolTextBlocks(text)).toHaveLength(2);
  });

  it("末尾に連続改行があっても空ブロックを生成しない", () => {
    const text = `ガブリアス
特性: さめはだ
能力補正: いじっぱり


`;
    expect(splitPokesolTextBlocks(text)).toHaveLength(1);
  });

  it("空白のみのブロックは除外する", () => {
    const text = `ガブリアス
特性: さめはだ
能力補正: いじっぱり


ギャラドス
特性: いかく
能力補正: ようき`;
    expect(splitPokesolTextBlocks(text)).toHaveLength(2);
  });
});

describe("parsePokesolTextMultiple", () => {
  it("1 匹のみのポケソルテキストをパースする", () => {
    const text = `ガブリアス @ こだわりスカーフ
特性: さめはだ
能力補正: いじっぱり
170(2)-200(32)-115-90-100-167(32)
じしん / ドラゴンクロー / つのドリル / いわなだれ`;
    const results = parsePokesolTextMultiple(text);
    expect(results).toHaveLength(1);
    expect(results[0]!.pokemonName).toBe("ガブリアス");
    expect(results[0]!.itemName).toBe("こだわりスカーフ");
    expect(results[0]!.abilityName).toBe("さめはだ");
    expect(results[0]!.natureName).toBe("いじっぱり");
    expect(results[0]!.moveNames).toEqual([
      "じしん",
      "ドラゴンクロー",
      "つのドリル",
      "いわなだれ",
    ]);
  });

  it("6 匹 (空行区切り) をパースする", () => {
    const member = (name: string): string =>
      `${name}\n特性: さめはだ\n能力補正: いじっぱり`;
    const text = [
      member("ガブリアス"),
      member("リザードン"),
      member("ピカチュウ"),
      member("ゲンガー"),
      member("カイリュー"),
      member("ハッサム"),
    ].join("\n\n");
    const results = parsePokesolTextMultiple(text);
    expect(results).toHaveLength(6);
    expect(results.map((r) => r.pokemonName)).toEqual([
      "ガブリアス",
      "リザードン",
      "ピカチュウ",
      "ゲンガー",
      "カイリュー",
      "ハッサム",
    ]);
  });

  it("パース失敗時にはブロック番号付きエラーを投げる", () => {
    const text = `ガブリアス
特性: さめはだ
能力補正: いじっぱり

これはめちゃくちゃな入力`;
    expect(() => parsePokesolTextMultiple(text)).toThrow(/ブロック 2/);
  });

  it("メガシンカ記法 `(メガ前特性)` をパースする", () => {
    const text = `バンギラス @ バンギラスナイト
特性: すなのちから(さめはだ)
能力補正: いじっぱり`;
    const results = parsePokesolTextMultiple(text);
    expect(results).toHaveLength(1);
    expect(results[0]!.abilityName).toBe("すなのちから");
    expect(results[0]!.preMegaAbilityName).toBe("さめはだ");
  });

  it("`@` を省略した (持ち物なし) ポケモンをパースする", () => {
    const text = `ガブリアス
特性: さめはだ
能力補正: いじっぱり`;
    const results = parsePokesolTextMultiple(text);
    expect(results[0]!.itemName).toBeNull();
  });

  it("実数値行を省略した入力をパースする", () => {
    const text = `ガブリアス
特性: さめはだ
能力補正: いじっぱり
じしん / ドラゴンクロー`;
    const results = parsePokesolTextMultiple(text);
    expect(results[0]!.actualValue.hp).toBeNull();
    expect(results[0]!.evs.hp).toBe(0);
    expect(results[0]!.moveNames).toEqual(["じしん", "ドラゴンクロー"]);
  });

  it("技行を省略した入力をパースする", () => {
    const text = `ガブリアス
特性: さめはだ
能力補正: いじっぱり`;
    const results = parsePokesolTextMultiple(text);
    expect(results[0]!.moveNames).toEqual([]);
  });
});

describe("mapPokesolResultToPartyMember", () => {
  function parsed(text: string) {
    return parsePokesolTextMultiple(text)[0]!;
  }

  it("パーサー出力を PartyMember に変換する (evs は atk/spe 互換名)", () => {
    const result = parsed(
      `ガブリアス @ こだわりスカーフ
特性: さめはだ
能力補正: いじっぱり
170(2)-200(32)-115-90-100-167(32)
じしん / ドラゴンクロー / つのドリル / いわなだれ`,
    );
    const { member, warnings } = mapPokesolResultToPartyMember(result, 1);
    expect(member.name).toBe("ガブリアス");
    expect(member.item).toBe("こだわりスカーフ");
    expect(member.ability).toBe("さめはだ");
    expect(member.nature).toBe("いじっぱり");
    expect(member.evs).toEqual({
      hp: 2,
      atk: 32,
      def: 0,
      spa: 0,
      spd: 0,
      spe: 32,
    });
    expect(member.moves).toEqual([
      "じしん",
      "ドラゴンクロー",
      "つのドリル",
      "いわなだれ",
    ]);
    expect(warnings).toEqual([]);
  });

  it("メガ進化特性はメガ前特性 (preMega) を ability として保存し warning を記録する", () => {
    const result = parsed(
      `バンギラス @ バンギラスナイト
特性: すなのちから(さめはだ)
能力補正: いじっぱり`,
    );
    const { member, warnings } = mapPokesolResultToPartyMember(result, 3);
    expect(member.ability).toBe("さめはだ");
    expect(warnings.some((w) => w.includes("ブロック 3"))).toBe(true);
    expect(warnings.some((w) => w.includes("すなのちから"))).toBe(true);
  });

  it("性格が省略された場合はデフォルトを補完し warning を記録する", () => {
    const result = parsed(
      `ガブリアス
特性: さめはだ
能力補正:`,
    );
    const { member, warnings } = mapPokesolResultToPartyMember(result, 2);
    expect(member.nature).toBe(DEFAULT_NATURE_NAME);
    expect(warnings.some((w) => w.includes("ブロック 2"))).toBe(true);
    expect(warnings.some((w) => w.includes(DEFAULT_NATURE_NAME))).toBe(true);
  });

  it("全て 0 の SP は evs フィールド自体を省く", () => {
    const result = parsed(
      `ガブリアス
特性: さめはだ
能力補正: いじっぱり
170-200-115-90-100-167`,
    );
    const { member } = mapPokesolResultToPartyMember(result, 1);
    expect(member.evs).toBeUndefined();
  });

  it("技行がなければ moves を設定せず warning を記録する", () => {
    const result = parsed(
      `ガブリアス
特性: さめはだ
能力補正: いじっぱり`,
    );
    const { member, warnings } = mapPokesolResultToPartyMember(result, 1);
    expect(member.moves).toBeUndefined();
    expect(warnings.some((w) => w.includes("技行"))).toBe(true);
  });
});
