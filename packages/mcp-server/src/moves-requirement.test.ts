import { describe, it, expect } from "vitest";
import { assertMovesSpecified, MOVES_OPTIONAL } from "./moves-requirement";

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
