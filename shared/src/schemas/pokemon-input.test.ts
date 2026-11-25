import { describe, it, expect } from "vitest";
import { MAX_MOVES_PER_MEMBER, MAX_NAME_LENGTH } from "./party";
import { conditionsSchema, pokemonSchema, pokemonWithMovesSchema } from "./pokemon-input";

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

const NAME_AT_LIMIT = "あ".repeat(MAX_NAME_LENGTH);
const NAME_OVER_LIMIT = "あ".repeat(MAX_NAME_LENGTH + 1);
const POKEMON_STRING_FIELDS = ["name", "nature", "ability", "item", "status"] as const;
const CONDITIONS_STRING_FIELDS = ["weather", "terrain"] as const;

describe.each([
  ["pokemonSchema", pokemonSchema],
  ["pokemonWithMovesSchema", pokemonWithMovesSchema],
])("%s の文字列項目", (_label, schema) => {
  it.each(POKEMON_STRING_FIELDS)("%s は最大文字数まで受け付ける", (field) => {
    const input = { name: "ガブリアス", [field]: NAME_AT_LIMIT };
    expect(schema.safeParse(input).success).toBe(true);
  });

  it.each(POKEMON_STRING_FIELDS)("%s は最大文字数を超えると拒否する", (field) => {
    const input = { name: "ガブリアス", [field]: NAME_OVER_LIMIT };
    expect(schema.safeParse(input).success).toBe(false);
  });
});

describe("conditionsSchema の文字列項目", () => {
  it.each(CONDITIONS_STRING_FIELDS)("%s は最大文字数まで受け付ける", (field) => {
    expect(conditionsSchema.safeParse({ [field]: NAME_AT_LIMIT }).success).toBe(true);
  });

  it.each(CONDITIONS_STRING_FIELDS)("%s は最大文字数を超えると拒否する", (field) => {
    expect(conditionsSchema.safeParse({ [field]: NAME_OVER_LIMIT }).success).toBe(false);
  });
});
