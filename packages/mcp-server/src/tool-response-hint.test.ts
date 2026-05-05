import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  TOOL_RESPONSE_HINT_CONTENT,
  TOOL_RESPONSE_HINT_TEXT,
} from "./tool-response-hint";

/**
 * tools/ 配下の実装ファイル (.ts、テストファイル除く) を再帰的に列挙する。
 * 全ツール registration が hint を必ず import していることを保証するための
 * 回帰テストで使う。
 */
function listToolImplFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listToolImplFiles(full));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}

describe("TOOL_RESPONSE_HINT_TEXT", () => {
  it("recommends ai-rotom tools rather than commanding the AI client", () => {
    // ツールレスポンス末尾に毎回付与する誘導テキストの設計意図
    // (ai-rotom 呼び出しを推奨する recency reminder) を固定化する。
    // 命令調はプロンプトインジェクション検出にフラグされ UX を悪化させるため、
    // 「ai-rotom」と「推奨」を含む推奨調表現を必須キーフレーズとする。
    expect(TOOL_RESPONSE_HINT_TEXT).toContain("ai-rotom");
    expect(TOOL_RESPONSE_HINT_TEXT).toContain("推奨");
  });

  it("explicitly lists pokemon name, move name, and speed as triggers", () => {
    // 「ポケモン名・技名・素早さ」の 3 トピックを明示することで、
    // ユーザー発話のトリガー判定を AI クライアントに委ねやすくする設計意図を固定化する。
    expect(TOOL_RESPONSE_HINT_TEXT).toContain("ポケモン名");
    expect(TOOL_RESPONSE_HINT_TEXT).toContain("技名");
    expect(TOOL_RESPONSE_HINT_TEXT).toContain("素早さ");
  });

  it("references Pokemon Champions to justify the recommendation", () => {
    // 推奨の根拠 (従来作と仕様が異なる) を明示することで AI クライアント側に
    // 判断材料を与え、命令調に頼らずに recency reminder を機能させる設計意図を固定化する。
    expect(TOOL_RESPONSE_HINT_TEXT).toContain("Pokemon Champions");
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

describe("hint import coverage", () => {
  it("every tool implementation file imports TOOL_RESPONSE_HINT_CONTENT", () => {
    // 新規ツール追加時に hint append を忘れる退行を機械的に検出する回帰テスト。
    // tools/ 配下の実装ファイル (テスト除く) すべてが hint をどこかで参照していることを保証する。
    // 共通ヘルパー (party-tools.ts の toTextResponse 等) 経由で適用するファイルも
    // 当該ヘルパー定義ファイル自身が hint を import しているはず。
    const toolsDir = join(import.meta.dirname, "tools");
    const toolFiles = listToolImplFiles(toolsDir);

    // tools/ 配下に実装ファイルが存在することを確認 (再帰列挙が壊れていないことの保証)。
    expect(toolFiles.length).toBeGreaterThan(0);

    const filesMissingHint = toolFiles.filter((file) => {
      const content = readFileSync(file, "utf-8");
      return !content.includes("TOOL_RESPONSE_HINT_CONTENT");
    });

    expect(filesMissingHint).toEqual([]);
  });
});
