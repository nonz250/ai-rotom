import { describe, it, expect } from "vitest";
import { MAX_MOVES_PER_MEMBER } from "@ai-rotom/shared";
import {
  assertMovesSpecified,
  assertMovesWithinLimit,
  MOVES_OPTIONAL,
} from "./moves-requirement";

const REQUIRED = { requireMoves: true };

describe("assertMovesSpecified", () => {
  it("技構成が任意なら、moves がなくてもエラーにしない", () => {
    expect(() =>
      assertMovesSpecified(MOVES_OPTIONAL, [{ field: "attacker", name: "ガブリアス" }]),
    ).not.toThrow();
  });

  it("技構成が必須でも、すべての攻撃側に moves があればエラーにしない", () => {
    expect(() =>
      assertMovesSpecified(REQUIRED, [
        { field: "pokemon1", name: "ガブリアス", moves: ["じしん"] },
        { field: "pokemon2", name: "サーフゴー", moves: ["ゴールドラッシュ"] },
      ]),
    ).not.toThrow();
  });

  it("技構成が必須なら、moves のない攻撃側をすべて挙げてエラーにする", () => {
    expect(() =>
      assertMovesSpecified(REQUIRED, [
        { field: "myParty[0]", name: "ガブリアス", moves: ["じしん"] },
        { field: "myParty[1]", name: "サーフゴー" },
        { field: "myParty[2]", name: "リザードン" },
      ]),
    ).toThrow(/myParty\[1\] \(サーフゴー\)、myParty\[2\] \(リザードン\) の moves/);
  });

  it("空の moves は指定なしとして扱う", () => {
    expect(() =>
      assertMovesSpecified(REQUIRED, [{ field: "attacker", name: "ガブリアス", moves: [] }]),
    ).toThrow(/attacker \(ガブリアス\)/);
  });
});

describe("assertMovesWithinLimit", () => {
  const AT_LIMIT = Array.from({ length: MAX_MOVES_PER_MEMBER }, () => "じしん");
  const OVER_LIMIT = [...AT_LIMIT, "じしん"];

  it("技構成が任意なら、上限を超える技数でもエラーにしない", () => {
    expect(() =>
      assertMovesWithinLimit(MOVES_OPTIONAL, { ガブリアス: OVER_LIMIT }),
    ).not.toThrow();
  });

  it("技構成が必須でも、moves 引数がなければエラーにしない", () => {
    expect(() => assertMovesWithinLimit(REQUIRED, undefined)).not.toThrow();
  });

  it("技構成が必須でも、上限ちょうどの技数ならエラーにしない", () => {
    expect(() =>
      assertMovesWithinLimit(REQUIRED, { ガブリアス: AT_LIMIT }),
    ).not.toThrow();
  });

  it("技構成が必須なら、上限を超えるポケモンをすべて挙げてエラーにする", () => {
    expect(() =>
      assertMovesWithinLimit(REQUIRED, {
        ガブリアス: OVER_LIMIT,
        サーフゴー: AT_LIMIT,
        リザードン: OVER_LIMIT,
      }),
    ).toThrow(
      new RegExp(`moves 引数の ガブリアス、リザードン の技を ${MAX_MOVES_PER_MEMBER} つ以内`),
    );
  });
});
