import { describe, it, expect } from "vitest";
import { REMOTE_SERVER_INSTRUCTIONS } from "./instructions";
import { handleRequest } from "./worker";

const TOKEN = "test-token";
const ENV = { AUTH_TOKEN: TOKEN };
const ORIGIN = "https://ai-rotom.example.workers.dev";

const MCP_HEADERS = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
};

function rpc(method: string, params: Record<string, unknown> = {}): string {
  return JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
}

function mcpRequest(
  path: string,
  body: string,
  headers: Record<string, string> = {},
  method = "POST",
): Request {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: { ...MCP_HEADERS, ...headers },
    body: method === "POST" ? body : undefined,
  });
}

const BEARER = { authorization: `Bearer ${TOKEN}` };
const INITIALIZE = rpc("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "test", version: "0.0.0" },
});

describe("handleRequest の認証", () => {
  it("トークンがないと 401 を返す", async () => {
    const res = await handleRequest(mcpRequest("/mcp", rpc("tools/list")), ENV);
    expect(res.status).toBe(401);
  });

  it("Bearer トークンが違うと 401 を返す", async () => {
    const res = await handleRequest(
      mcpRequest("/mcp", rpc("tools/list"), { authorization: "Bearer wrong" }),
      ENV,
    );
    expect(res.status).toBe(401);
  });

  it("パスのトークンが違うと 401 を返す", async () => {
    const res = await handleRequest(mcpRequest("/mcp/wrong", rpc("tools/list")), ENV);
    expect(res.status).toBe(401);
  });

  it("Bearer の大文字小文字を区別しない", async () => {
    for (const scheme of ["bearer", "BEARER"]) {
      const res = await handleRequest(
        mcpRequest("/mcp", rpc("tools/list"), { authorization: `${scheme} ${TOKEN}` }),
        ENV,
      );
      expect(res.status).toBe(200);
    }
  });

  it("パスのトークンは URL デコードしてから照合する", async () => {
    const token = "a b+c";
    const res = await handleRequest(
      mcpRequest(`/mcp/${encodeURIComponent(token)}`, rpc("tools/list")),
      { AUTH_TOKEN: token },
    );
    expect(res.status).toBe(200);
  });

  it("デコードできないパスは 404 を返す", async () => {
    const res = await handleRequest(mcpRequest("/mcp/%E0%A4%A", rpc("tools/list")), ENV);
    expect(res.status).toBe(404);
  });

  it("トークンの前方一致では通さない", async () => {
    const res = await handleRequest(
      mcpRequest(`/mcp/${TOKEN.slice(0, -1)}`, rpc("tools/list")),
      ENV,
    );
    expect(res.status).toBe(401);
  });

  it("サーバーにトークンが設定されていなければ、どのリクエストも 503 で拒否する", async () => {
    for (const env of [{}, { AUTH_TOKEN: "" }]) {
      const res = await handleRequest(mcpRequest("/mcp", rpc("tools/list"), BEARER), env);
      expect(res.status).toBe(503);
    }
  });
});

describe("handleRequest のルーティング", () => {
  it("MCP 以外のパスは 404 を返す", async () => {
    for (const path of ["/", "/mcpx", `/mcp/${TOKEN}/extra`]) {
      const res = await handleRequest(mcpRequest(path, rpc("tools/list"), BEARER), ENV);
      expect(res.status).toBe(404);
    }
  });

  it("POST 以外のメソッドは 405 を返す", async () => {
    for (const method of ["GET", "DELETE"]) {
      const res = await handleRequest(mcpRequest("/mcp", "", BEARER, method), ENV);
      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("POST");
    }
  });
});

describe("handleRequest の MCP 応答", () => {
  it("initialize にリモート版の instructions を返す", async () => {
    const res = await handleRequest(mcpRequest("/mcp", INITIALIZE, BEARER), ENV);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.result.instructions).toBe(REMOTE_SERVER_INSTRUCTIONS);
  });

  it("パーティ保存系を除いたツール一覧を返す", async () => {
    const res = await handleRequest(mcpRequest("/mcp", rpc("tools/list"), BEARER), ENV);
    const names = (await res.json()).result.tools.map((tool: { name: string }) => tool.name);

    expect(names).toContain("calculate_damage_party_matchup");
    expect(names).not.toContain("save_party");
    expect(names).not.toContain("import_party_from_text");
  });

  it("パスにトークンを入れてもツールを呼べる", async () => {
    const res = await handleRequest(
      mcpRequest(
        `/mcp/${TOKEN}`,
        rpc("tools/call", { name: "get_pokemon_info", arguments: { name: "ガブリアス" } }),
      ),
      ENV,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.result.isError).toBeUndefined();
    expect(JSON.parse(body.result.content[0].text).name).toBe("Garchomp");
  });
});

describe("handleRequest の技構成の要求", () => {
  async function callTool(name: string, args: Record<string, unknown>) {
    const res = await handleRequest(
      mcpRequest("/mcp", rpc("tools/call", { name, arguments: args }), BEARER),
      ENV,
    );
    return (await res.json()).result as { isError?: boolean; content: { text: string }[] };
  }

  const GARCHOMP_MOVES = ["じしん", "げきりん", "ストーンエッジ", "ほのおのキバ"];

  it("全技ダメ計は attacker の moves がないとエラーで指定を求める", async () => {
    const result = await callTool("calculate_damage_all_moves", {
      attacker: { name: "ガブリアス" },
      defender: { name: "サーフゴー" },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("attacker (ガブリアス) の moves");
  });

  it("全技ダメ計は attacker の moves があれば計算する", async () => {
    const result = await callTool("calculate_damage_all_moves", {
      attacker: { name: "ガブリアス", moves: GARCHOMP_MOVES },
      defender: { name: "サーフゴー" },
    });

    expect(result.isError).toBeUndefined();
  });

  it("6v6 ダメ計は moves のない myParty のメンバーを挙げてエラーにする", async () => {
    const result = await callTool("calculate_damage_party_matchup", {
      myParty: [{ name: "ガブリアス", moves: GARCHOMP_MOVES }, { name: "リザードン" }],
      opponentParty: [{ name: "サーフゴー" }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("myParty[1] (リザードン) の moves");
    expect(result.content[0].text).not.toContain("myParty[0]");
  });

  it("対面分析は pokemon1 の moves がないとエラーにする", async () => {
    const result = await callTool("analyze_matchup", {
      pokemon1: { name: "ガブリアス" },
      pokemon2: { name: "サーフゴー", moves: ["ゴールドラッシュ"] },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("pokemon1 (ガブリアス) の moves");
  });

  it("対面分析は相手側の pokemon2 の moves を求めない", async () => {
    const result = await callTool("analyze_matchup", {
      pokemon1: { name: "ガブリアス", moves: GARCHOMP_MOVES },
      pokemon2: { name: "サーフゴー" },
    });

    expect(result.isError).toBeUndefined();
  });

  it("選出分析は moves 引数で指定した技構成も指定ありとして扱う", async () => {
    const result = await callTool("analyze_selection", {
      myParty: [{ name: "ガブリアス" }],
      opponentParty: [{ name: "サーフゴー" }],
      battleFormat: "singles",
      moves: { ガブリアス: GARCHOMP_MOVES },
    });

    expect(result.isError).toBeUndefined();
  });

  it("選出分析は相手パーティの moves を求めない", async () => {
    const result = await callTool("analyze_selection", {
      myParty: [{ name: "ガブリアス", moves: GARCHOMP_MOVES }],
      opponentParty: [{ name: "サーフゴー" }],
      battleFormat: "singles",
    });

    expect(result.isError).toBeUndefined();
  });
});
