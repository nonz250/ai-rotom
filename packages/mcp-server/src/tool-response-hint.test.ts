import { describe, it, expect } from "vitest";
import {
  TOOL_RESPONSE_HINT_CONTENT,
  TOOL_RESPONSE_HINT_TEXT,
} from "./tool-response-hint";

describe("TOOL_RESPONSE_HINT_TEXT", () => {
  it("instructs the AI client to call ai-rotom tools instead of relying on memory", () => {
    // ツールレスポンス末尾に毎回付与する誘導テキストの設計意図 (記憶ベース即答禁止 +
    // ai-rotom 呼び出し誘導) を固定化する。文言の細部は後で調整され得るが、
    // 「ai-rotom のツールを呼ぶこと」「知識ベースで答えず」は外せないキーフレーズ。
    expect(TOOL_RESPONSE_HINT_TEXT).toContain("ai-rotom");
    expect(TOOL_RESPONSE_HINT_TEXT).toContain("知識ベースで答えず");
    expect(TOOL_RESPONSE_HINT_TEXT).toContain("ツールを呼ぶ");
  });

  it("explicitly lists pokemon name, move name, and speed as triggers", () => {
    // 「ポケモン名・技名・素早さ」の 3 トピックを明示することで、
    // ユーザー発話のトリガー判定を AI クライアントに委ねやすくする設計意図を固定化する。
    expect(TOOL_RESPONSE_HINT_TEXT).toContain("ポケモン名");
    expect(TOOL_RESPONSE_HINT_TEXT).toContain("技名");
    expect(TOOL_RESPONSE_HINT_TEXT).toContain("素早さ");
  });
});

describe("TOOL_RESPONSE_HINT_CONTENT", () => {
  it("is a text content item that wraps TOOL_RESPONSE_HINT_TEXT", () => {
    // MCP のレスポンス content 配列にそのまま push できる形式であることを保証する。
    // 各ツールが個別に content オブジェクトを組み立てると形式が分散するため、
    // 共通定数として固定する設計意図。
    expect(TOOL_RESPONSE_HINT_CONTENT).toEqual({
      type: "text",
      text: TOOL_RESPONSE_HINT_TEXT,
    });
  });
});
