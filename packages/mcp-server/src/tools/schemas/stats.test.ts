import { describe, it, expect } from "vitest";
import { evsSchema, boostsSchema } from "./stats";

describe("boostsSchema", () => {
  it("accepts values within -6..+6", () => {
    expect(boostsSchema.safeParse({ atk: -6 }).success).toBe(true);
    expect(boostsSchema.safeParse({ atk: 0 }).success).toBe(true);
    expect(boostsSchema.safeParse({ atk: 6 }).success).toBe(true);
  });

  it("rejects values outside -6..+6", () => {
    expect(boostsSchema.safeParse({ atk: -7 }).success).toBe(false);
    expect(boostsSchema.safeParse({ atk: 7 }).success).toBe(false);
  });

  it("rejects non-integer numeric values", () => {
    expect(boostsSchema.safeParse({ atk: 6.5 }).success).toBe(false);
  });

  it("rejects non-finite numeric values", () => {
    expect(boostsSchema.safeParse({ atk: Number.NaN }).success).toBe(false);
    expect(boostsSchema.safeParse({ atk: Number.POSITIVE_INFINITY }).success).toBe(false);
  });

  it("rejects string values", () => {
    expect(boostsSchema.safeParse({ atk: "3" }).success).toBe(false);
  });

  it("accepts empty object and undefined fields", () => {
    expect(boostsSchema.safeParse({}).success).toBe(true);
    expect(boostsSchema.safeParse({ atk: undefined }).success).toBe(true);
  });
});

describe("evsSchema (pre-validation stage)", () => {
  it("accepts typical values without range enforcement yet", () => {
    // NOTE: 値域の厳格化は後続コミットで追加する。
    // ここでは evs と boosts の型が別物になっていることのみを確認する。
    expect(evsSchema.safeParse({ hp: 32, atk: 32 }).success).toBe(true);
  });

  it("accepts empty object", () => {
    expect(evsSchema.safeParse({}).success).toBe(true);
  });
});
