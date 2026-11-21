import { describe, it, expect } from "vitest";
import { MAX_MOVES_PER_MEMBER } from "./party";
import { pokemonSchema } from "./pokemon-input";

const MOVE_NAMES = ["じしん", "げきりん", "ストーンエッジ", "つるぎのまい", "ほのおのキバ"];

describe("pokemonSchema.moves", () => {
  it("技を 4 個まで指定できる", () => {
    const moves = MOVE_NAMES.slice(0, MAX_MOVES_PER_MEMBER);
    expect(pokemonSchema.safeParse({ name: "ガブリアス", moves }).success).toBe(true);
  });

  it("技を 5 個以上指定すると拒否する", () => {
    const moves = MOVE_NAMES.slice(0, MAX_MOVES_PER_MEMBER + 1);
    expect(pokemonSchema.safeParse({ name: "ガブリアス", moves }).success).toBe(false);
  });

  it("技の指定は省略できる", () => {
    expect(pokemonSchema.safeParse({ name: "ガブリアス" }).success).toBe(true);
  });
});
