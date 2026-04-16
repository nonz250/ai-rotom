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

describe("evsSchema (single-stat range)", () => {
  it.each([0, 1, 31, 32])("accepts single stat value %s", (value) => {
    expect(evsSchema.safeParse({ hp: value }).success).toBe(true);
  });

  it.each([33, 252, -1])("rejects out-of-range integer value %s", (value) => {
    expect(evsSchema.safeParse({ hp: value }).success).toBe(false);
  });

  it("rejects non-integer values", () => {
    expect(evsSchema.safeParse({ hp: 32.5 }).success).toBe(false);
    expect(evsSchema.safeParse({ hp: 0.1 }).success).toBe(false);
  });

  it("rejects non-finite values", () => {
    expect(evsSchema.safeParse({ hp: Number.NaN }).success).toBe(false);
    expect(evsSchema.safeParse({ hp: Number.POSITIVE_INFINITY }).success).toBe(false);
  });

  it("rejects string-typed values", () => {
    expect(evsSchema.safeParse({ hp: "32" }).success).toBe(false);
  });

  it("rejects null-typed values", () => {
    expect(evsSchema.safeParse({ hp: null }).success).toBe(false);
  });

  it("accepts undefined / omitted fields", () => {
    expect(evsSchema.safeParse({ hp: undefined }).success).toBe(true);
    expect(evsSchema.safeParse({}).success).toBe(true);
  });
});

describe("evsSchema (total sum)", () => {
  it("accepts total exactly at the upper bound (66)", () => {
    expect(evsSchema.safeParse({ hp: 32, atk: 32, spe: 2 }).success).toBe(true);
    expect(
      evsSchema.safeParse({ hp: 11, atk: 11, def: 11, spa: 11, spd: 11, spe: 11 }).success,
    ).toBe(true);
  });

  it("rejects total 67 (over by 1)", () => {
    expect(evsSchema.safeParse({ hp: 32, atk: 32, spe: 3 }).success).toBe(false);
  });

  it("rejects clearly over-budget totals", () => {
    expect(
      evsSchema.safeParse({ hp: 32, atk: 32, def: 32, spa: 32, spd: 32, spe: 32 }).success,
    ).toBe(false);
  });
});

describe("evsSchema error messages", () => {
  it("single-stat over-limit message mentions Champions spec and 32/252/EV", () => {
    const result = evsSchema.safeParse({ hp: 33 });
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    const message = result.error.issues.map((i) => i.message).join("\n");
    expect(message).toContain("チャンピオンズ");
    expect(message).toContain("32");
    expect(message).toContain("EV");
    expect(message).toContain("252");
  });

  it("total over-limit message mentions 66/32/252 and Champions spec", () => {
    const result = evsSchema.safeParse({ hp: 32, atk: 32, spe: 3 });
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    const message = result.error.issues.map((i) => i.message).join("\n");
    expect(message).toContain("チャンピオンズ");
    expect(message).toContain("66");
    expect(message).toContain("32");
    expect(message).toContain("EV");
    expect(message).toContain("252");
  });
});
