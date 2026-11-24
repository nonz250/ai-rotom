import { describe, it, expect } from "vitest";
import { loadConfig } from "./config";

describe("loadConfig", () => {
  it("AUTH_TOKEN を認証トークンとして読む", () => {
    expect(loadConfig({ AUTH_TOKEN: "secret" }).authToken).toBe("secret");
  });

  it("AUTH_TOKEN が未設定・空文字・文字列以外なら認証トークンなしとして扱う", () => {
    for (const source of [{}, { AUTH_TOKEN: "" }, { AUTH_TOKEN: 123 }]) {
      expect(loadConfig(source).authToken).toBeUndefined();
    }
  });

  it("REQUIRE_MOVES が未設定なら技構成を必須にする", () => {
    expect(loadConfig({}).requireMoves).toBe(true);
  });

  it("REQUIRE_MOVES が false なら、文字列でも真偽値でも技構成を任意にする", () => {
    for (const value of ["false", " FALSE ", false]) {
      expect(loadConfig({ REQUIRE_MOVES: value }).requireMoves).toBe(false);
    }
  });

  it("REQUIRE_MOVES が false 以外なら技構成を必須にする", () => {
    for (const value of ["true", "", "no", true, 0]) {
      expect(loadConfig({ REQUIRE_MOVES: value }).requireMoves).toBe(true);
    }
  });
});
