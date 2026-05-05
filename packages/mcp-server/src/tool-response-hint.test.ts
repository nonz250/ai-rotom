import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  TOOL_RESPONSE_HINT_CONTENT,
  TOOL_RESPONSE_HINT_TEXT,
  toErrorResponse,
  toTextResponse,
  withHint,
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

describe("withHint", () => {
  it("appends TOOL_RESPONSE_HINT_CONTENT after the given content items", () => {
    // 渡された content の末尾に必ず hint が並ぶ仕様を固定化する
    // (「直書き 22 箇所」を統一する目的の中核)。
    const item = { type: "text" as const, text: "payload" };
    expect(withHint(item)).toEqual({
      content: [item, TOOL_RESPONSE_HINT_CONTENT],
    });
  });

  it("supports multiple text content items in order", () => {
    // 複数 text item を返すケース (将来の余地) でも順序が保たれること。
    const a = { type: "text" as const, text: "a" };
    const b = { type: "text" as const, text: "b" };
    expect(withHint(a, b).content).toEqual([a, b, TOOL_RESPONSE_HINT_CONTENT]);
  });

  it("returns hint-only response when called with no arguments", () => {
    // 退化ケース (hint のみ) でも正しく動くことを保証。
    expect(withHint()).toEqual({ content: [TOOL_RESPONSE_HINT_CONTENT] });
  });
});

describe("toTextResponse", () => {
  it("JSON.stringify する text item を 1 件返し末尾に hint を付与する", () => {
    // 「結果オブジェクト 1 つだけ返す」典型ケース向けの薄いラッパーが
    // withHint と同じ形に展開されることを保証する。
    const value = { foo: 1, bar: "x" };
    expect(toTextResponse(value)).toEqual({
      content: [
        { type: "text", text: JSON.stringify(value) },
        TOOL_RESPONSE_HINT_CONTENT,
      ],
    });
  });
});

describe("toErrorResponse", () => {
  it("wraps an Error message into isError: true response without hint", () => {
    // エラー時はノイズ回避のため hint を付けない仕様を固定化する。
    const result = toErrorResponse(new Error("boom"));
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: "text", text: JSON.stringify({ error: "boom" }) },
    ]);
    expect(result.content).not.toContainEqual(TOOL_RESPONSE_HINT_CONTENT);
  });

  it("falls back to a generic message for non-Error throws", () => {
    // throw "string" のようなケースでも安全に文字列化されることを保証。
    const result = toErrorResponse("oops");
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      {
        type: "text",
        text: JSON.stringify({ error: "不明なエラーが発生しました" }),
      },
    ]);
  });
});

describe("hint import coverage", () => {
  it("every tool implementation file goes through withHint (directly or via toTextResponse)", () => {
    // 新規ツール追加時に hint append を忘れる退行を機械的に検出する回帰テスト。
    // tools/ 配下の実装ファイル (テスト除く) すべてが
    // withHint または toTextResponse を import していることを保証する
    // (toTextResponse は内部で withHint を呼ぶため hint 付与を構造的に保証する)。
    const toolsDir = join(import.meta.dirname, "tools");
    const toolFiles = listToolImplFiles(toolsDir);

    // tools/ 配下に実装ファイルが存在することを確認 (再帰列挙が壊れていないことの保証)。
    expect(toolFiles.length).toBeGreaterThan(0);

    const filesMissingHint = toolFiles.filter((file) => {
      const content = readFileSync(file, "utf-8");
      const importsFromHintModule = /from\s+["']\.\.\/\.\.\/tool-response-hint\.js["']/.test(
        content,
      );
      if (!importsFromHintModule) {
        return true;
      }
      // 直接 withHint を import するか、内部で withHint を呼ぶ toTextResponse を import している必要がある。
      const usesWithHint = /\bwithHint\b/.test(content);
      const usesToTextResponse = /\btoTextResponse\b/.test(content);
      return !usesWithHint && !usesToTextResponse;
    });

    expect(filesMissingHint).toEqual([]);
  });

  it("no tool implementation file directly composes hint via TOOL_RESPONSE_HINT_CONTENT", () => {
    // 直書き 22 箇所を統一した結果として、hint 定数を直接 import する実装ファイルは
    // ゼロ件 (共通ヘルパー withHint / toTextResponse 経由のみ) であることを保証する。
    // これにより新規ツール追加時に直書きパターンに戻る退行を構造的に防ぐ。
    const toolsDir = join(import.meta.dirname, "tools");
    const toolFiles = listToolImplFiles(toolsDir);

    const filesUsingDirectConstant = toolFiles.filter((file) => {
      const content = readFileSync(file, "utf-8");
      return /\bTOOL_RESPONSE_HINT_CONTENT\b/.test(content);
    });

    expect(filesUsingDirectConstant).toEqual([]);
  });
});
