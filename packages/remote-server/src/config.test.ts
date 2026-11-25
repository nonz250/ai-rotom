import { describe, it, expect } from "vitest";
import { loadConfig } from "./config";

describe("loadConfig", () => {
  const TOKEN = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  it("AUTH_TOKEN を認証トークンとして読む", () => {
    expect(loadConfig({ AUTH_TOKEN: TOKEN }).authToken).toBe(TOKEN);
  });

  it("AUTH_TOKEN が未設定・空文字・文字列以外なら認証トークンなしとして扱う", () => {
    for (const source of [{}, { AUTH_TOKEN: "" }, { AUTH_TOKEN: 123 }]) {
      expect(loadConfig(source).authToken).toBeUndefined();
    }
  });

  it("AUTH_TOKEN がちょうど 32 文字なら認証トークンとして読む", () => {
    const token = "a".repeat(32);
    expect(loadConfig({ AUTH_TOKEN: token }).authToken).toBe(token);
  });

  it("AUTH_TOKEN が 31 文字なら認証トークンなしとして扱う", () => {
    expect(loadConfig({ AUTH_TOKEN: "a".repeat(31) }).authToken).toBeUndefined();
  });

  it("以前ローカル開発用に案内していたトークンは認証トークンとして使わない", () => {
    expect(loadConfig({ AUTH_TOKEN: "local-dev-token" }).authToken).toBeUndefined();
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

  it("ALLOWED_HOSTS が未設定・文字列以外ならホスト名を確かめない", () => {
    for (const source of [{}, { ALLOWED_HOSTS: 1 }, { ALLOWED_HOSTS: true }]) {
      expect(loadConfig(source).allowedHosts).toBeUndefined();
    }
  });

  it("ALLOWED_HOSTS をカンマで区切り、前後の空白を除いて小文字にそろえる", () => {
    expect(
      loadConfig({ ALLOWED_HOSTS: " Ai-Rotom.Example.workers.dev , mcp.example.com" }).allowedHosts,
    ).toEqual(["ai-rotom.example.workers.dev", "mcp.example.com"]);
  });

  it("ALLOWED_HOSTS の空の要素は無視する", () => {
    expect(loadConfig({ ALLOWED_HOSTS: ",a.example,, ,b.example," }).allowedHosts).toEqual([
      "a.example",
      "b.example",
    ]);
  });

  it("ALLOWED_HOSTS にホスト名が 1 つもなければ未設定として扱う", () => {
    for (const value of ["", " ", ",", " , ,"]) {
      expect(loadConfig({ ALLOWED_HOSTS: value }).allowedHosts).toBeUndefined();
    }
  });
});
