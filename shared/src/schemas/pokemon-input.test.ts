import { describe, it, expect } from "vitest";
import { MAX_MOVES_PER_MEMBER, MAX_NAME_LENGTH } from "./party";
import { pokemonSchema, pokemonWithMovesSchema } from "./pokemon-input";

const MOVE_NAMES = ["じしん", "げきりん", "ストーンエッジ", "つるぎのまい", "ほのおのキバ"];

describe("pokemonWithMovesSchema.moves", () => {
  it("技を 4 個まで指定できる", () => {
    const moves = MOVE_NAMES.slice(0, MAX_MOVES_PER_MEMBER);
    expect(pokemonWithMovesSchema.safeParse({ name: "ガブリアス", moves }).success).toBe(true);
  });

  it("技を 5 個以上指定すると拒否する", () => {
    const moves = MOVE_NAMES.slice(0, MAX_MOVES_PER_MEMBER + 1);
    expect(pokemonWithMovesSchema.safeParse({ name: "ガブリアス", moves }).success).toBe(false);
  });

  it("技の指定は省略できる", () => {
    expect(pokemonWithMovesSchema.safeParse({ name: "ガブリアス" }).success).toBe(true);
  });

  it("空文字の技名を拒否する", () => {
    expect(pokemonWithMovesSchema.safeParse({ name: "ガブリアス", moves: [""] }).success).toBe(false);
  });

  it("技名は最大文字数まで受け付け、超えると拒否する", () => {
    const atLimit = "あ".repeat(MAX_NAME_LENGTH);
    const overLimit = "あ".repeat(MAX_NAME_LENGTH + 1);
    expect(pokemonWithMovesSchema.safeParse({ name: "ガブリアス", moves: [atLimit] }).success).toBe(true);
    expect(pokemonWithMovesSchema.safeParse({ name: "ガブリアス", moves: [overLimit] }).success).toBe(false);
  });
});

describe("pokemonSchema", () => {
  it("技構成を扱わないので moves を取り除く", () => {
    const parsed = pokemonSchema.parse({ name: "ガブリアス", moves: ["じしん"] });
    expect(parsed).not.toHaveProperty("moves");
  });
});
