import { describe, it, expect } from "vitest";
import { compareSpeed } from "./speed-comparator";

describe("compareSpeed", () => {
  it("a が b より大きければ 'faster' を返す", () => {
    expect(compareSpeed(122, 100)).toBe("faster");
  });

  it("a が b より小さければ 'slower' を返す", () => {
    expect(compareSpeed(80, 100)).toBe("slower");
  });

  it("a と b が等しければ 'tie' を返す", () => {
    expect(compareSpeed(100, 100)).toBe("tie");
  });

  it("0 同士でも tie を返す（エッジケース）", () => {
    expect(compareSpeed(0, 0)).toBe("tie");
  });

  it("微差でも正しく判定する", () => {
    expect(compareSpeed(123, 122)).toBe("faster");
    expect(compareSpeed(121, 122)).toBe("slower");
  });
});
