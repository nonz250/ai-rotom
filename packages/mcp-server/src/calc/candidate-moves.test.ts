import { describe, it, expect } from "vitest";
import { candidateMoveIds } from "./candidate-moves";

describe("candidateMoveIds", () => {
  it("技構成を指定すると指定した技だけを返す", () => {
    expect(candidateMoveIds("Scizor", ["アイアンヘッド", "とんぼがえり"])).toEqual([
      "ironhead",
      "uturn",
    ]);
  });

  it("技構成を省略すると習得技すべてを返す", () => {
    expect(candidateMoveIds("Scizor", undefined)).toContain("bulletpunch");
  });

  it("技構成が空配列なら習得技すべてを返す", () => {
    expect(candidateMoveIds("Scizor", [])).toContain("bulletpunch");
  });

  it("learnset 未整備のフォルムは元のポケモンの習得技を返す", () => {
    expect(candidateMoveIds("Scizor-Mega", undefined)).toContain("bulletpunch");
  });
});
