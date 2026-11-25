import { afterEach, describe, it, expect, vi } from "vitest";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { MAX_MOVES_PER_MEMBER } from "@ai-rotom/shared";
import { buildRemoteServerInstructions } from "./instructions";
import { loadConfig, type ConfigSource } from "./config";
import { createRequestHandler, type RateLimiter } from "./handler";

/** 環境変数から設定を読んでハンドラーに渡す、各サービスのエントリと同じ流れで呼ぶ。 */
function handleRequest(request: Request, env: ConfigSource): Promise<Response> {
  return createRequestHandler(loadConfig(env))(request);
}

const TOKEN = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
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
const MAX_REQUEST_BODY_BYTES = 64 * 1024;
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
    const token = `a b+c${TOKEN}`;
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

  it("長さの違うトークンは、前方が一致していても延長されていても 401 を返す", async () => {
    for (const token of [TOKEN.slice(0, -1), `${TOKEN}0`, `${TOKEN}${TOKEN}`, "x"]) {
      const res = await handleRequest(
        mcpRequest("/mcp", rpc("tools/list"), { authorization: `Bearer ${token}` }),
        ENV,
      );
      expect(res.status).toBe(401);
    }
  });

  it("同じ長さで最後の 1 文字だけ違うトークンは 401 を返す", async () => {
    const token = `${TOKEN.slice(0, -1)}${TOKEN.endsWith("0") ? "1" : "0"}`;
    const res = await handleRequest(
      mcpRequest("/mcp", rpc("tools/list"), { authorization: `Bearer ${token}` }),
      ENV,
    );
    expect(res.status).toBe(401);
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

  it("サーバーのトークンが短すぎると、そのトークンを送っても 503 で拒否する", async () => {
    for (const token of ["a".repeat(31), "local-dev-token"]) {
      const res = await handleRequest(
        mcpRequest("/mcp", rpc("tools/list"), { authorization: `Bearer ${token}` }),
        { AUTH_TOKEN: token },
      );
      expect(res.status).toBe(503);
    }
  });
});

describe("handleRequest が MCP SDK に渡すリクエスト", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function requestSeenBySdk(request: Request): Promise<Request> {
    const spy = vi.spyOn(WebStandardStreamableHTTPServerTransport.prototype, "handleRequest");
    const res = await handleRequest(request, ENV);
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
    return spy.mock.calls[0][0];
  }

  it("Bearer で認証したときは authorization ヘッダーを渡さない", async () => {
    const seen = await requestSeenBySdk(mcpRequest("/mcp", rpc("tools/list"), BEARER));

    expect(seen.headers.has("authorization")).toBe(false);
    expect(new URL(seen.url).pathname).toBe("/mcp");
  });

  it("パスで認証したときは、トークンとクエリを除いた /mcp の URL で渡す", async () => {
    const seen = await requestSeenBySdk(mcpRequest(`/mcp/${TOKEN}?x=1`, rpc("tools/list")));

    expect(seen.url).toBe(`${ORIGIN}/mcp`);
    expect(seen.url).not.toContain(TOKEN);
  });

  it("MCP の処理に要るヘッダーはそのまま渡す", async () => {
    const seen = await requestSeenBySdk(
      mcpRequest("/mcp", rpc("tools/list"), { ...BEARER, "mcp-protocol-version": "2025-06-18" }),
    );

    expect(seen.method).toBe("POST");
    expect(seen.headers.get("accept")).toBe(MCP_HEADERS.accept);
    expect(seen.headers.get("content-type")).toBe(MCP_HEADERS["content-type"]);
    expect(seen.headers.get("mcp-protocol-version")).toBe("2025-06-18");
  });
});

describe("handleRequest の応答ヘッダー", () => {
  function expectNoStoreAndNoReferrer(res: Response): void {
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  }

  it("MCP の処理結果の応答に付ける", async () => {
    const res = await handleRequest(mcpRequest("/mcp", rpc("tools/list"), BEARER), ENV);
    expect(res.status).toBe(200);
    expectNoStoreAndNoReferrer(res);
  });

  it("通知だけを受けた 202 の応答にも付ける", async () => {
    const notification = JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" });
    const res = await handleRequest(mcpRequest("/mcp", notification, BEARER), ENV);
    expect(res.status).toBe(202);
    expectNoStoreAndNoReferrer(res);
  });

  it("拒否するときの応答にも付ける", async () => {
    const cases: [Request, Record<string, string>, number][] = [
      [mcpRequest("/mcp", "[]", BEARER), ENV, 400],
      [mcpRequest("/mcp", rpc("tools/list")), ENV, 401],
      [mcpRequest("/", rpc("tools/list"), BEARER), ENV, 404],
      [mcpRequest("/mcp", "", BEARER, "GET"), ENV, 405],
      [mcpRequest("/mcp", " ".repeat(MAX_REQUEST_BODY_BYTES + 1), BEARER), ENV, 413],
      [mcpRequest("/mcp", rpc("tools/list"), BEARER), {}, 503],
    ];
    for (const [request, env, status] of cases) {
      const res = await handleRequest(request, env);
      expect(res.status).toBe(status);
      expectNoStoreAndNoReferrer(res);
    }
  });
});

describe("handleRequest のレート制限", () => {
  const RETRY_AFTER_SECONDS = 60;

  /** allowed の値を返し、渡されたキーを記録する制限の代わり。 */
  function fakeLimiter(allowed: boolean): RateLimiter & { keys: string[] } {
    const keys: string[] = [];
    return {
      keys,
      retryAfterSeconds: RETRY_AFTER_SECONDS,
      async allow(key) {
        keys.push(key);
        return allowed;
      },
    };
  }

  function handleWithLimiter(
    request: Request,
    limiter: RateLimiter,
    env: ConfigSource = ENV,
  ): Promise<Response> {
    return createRequestHandler(loadConfig(env), limiter)(request);
  }

  it("上限に収まっていれば MCP の処理まで進める", async () => {
    const limiter = fakeLimiter(true);
    const res = await handleWithLimiter(mcpRequest("/mcp", rpc("tools/list"), BEARER), limiter);

    expect(res.status).toBe(200);
    expect(limiter.keys).toHaveLength(1);
  });

  it("上限に達していれば 429 と Retry-After を返し、no-store と no-referrer も付ける", async () => {
    const res = await handleWithLimiter(
      mcpRequest("/mcp", rpc("tools/list"), BEARER),
      fakeLimiter(false),
    );

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe(String(RETRY_AFTER_SECONDS));
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await res.text()).toBe("Too Many Requests");
  });

  it("上限に達していれば本文が不正でも 429 を返し、MCP SDK に渡さない", async () => {
    const spy = vi.spyOn(WebStandardStreamableHTTPServerTransport.prototype, "handleRequest");
    const res = await handleWithLimiter(mcpRequest("/mcp", "{", BEARER), fakeLimiter(false));

    expect(res.status).toBe(429);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("認証を通らないリクエストやルーティングで弾くリクエストは数えない", async () => {
    const cases: [Request, ConfigSource, number][] = [
      [mcpRequest("/mcp", rpc("tools/list")), ENV, 401],
      [mcpRequest("/mcp", rpc("tools/list"), { authorization: "Bearer wrong" }), ENV, 401],
      [mcpRequest("/", rpc("tools/list"), BEARER), ENV, 404],
      [mcpRequest("/mcp", rpc("tools/list"), BEARER), {}, 503],
      [mcpRequest("/mcp", rpc("tools/list"), { ...BEARER, origin: ORIGIN }), ENV, 403],
      [mcpRequest("/mcp", rpc("tools/list"), BEARER), { ...ENV, ALLOWED_HOSTS: "other.example" }, 403],
      [
        new Request("http://ai-rotom.example.workers.dev/mcp", {
          method: "POST",
          headers: { ...MCP_HEADERS, ...BEARER },
          body: rpc("tools/list"),
        }),
        ENV,
        403,
      ],
    ];
    for (const [request, env, status] of cases) {
      const limiter = fakeLimiter(false);
      const res = await handleWithLimiter(request, limiter, env);
      expect(res.status).toBe(status);
      expect(limiter.keys).toHaveLength(0);
    }
  });

  it("キーにはトークンを含めず、Bearer とパスのどちらで送っても同じキーで数える", async () => {
    const limiter = fakeLimiter(true);
    await handleWithLimiter(mcpRequest("/mcp", rpc("tools/list"), BEARER), limiter);
    await handleWithLimiter(mcpRequest(`/mcp/${TOKEN}`, rpc("tools/list")), limiter);

    const [bearerKey, pathKey] = limiter.keys;
    expect(bearerKey).toBe(pathKey);
    expect(bearerKey).not.toContain(TOKEN);
    expect(TOKEN).not.toContain(bearerKey);
  });

  it("トークンが変わればキーも変わる", async () => {
    const otherToken = "f".repeat(TOKEN.length);
    const limiter = fakeLimiter(true);
    await handleWithLimiter(mcpRequest("/mcp", rpc("tools/list"), BEARER), limiter);
    await handleWithLimiter(
      mcpRequest("/mcp", rpc("tools/list"), { authorization: `Bearer ${otherToken}` }),
      limiter,
      { AUTH_TOKEN: otherToken },
    );

    expect(limiter.keys[0]).not.toBe(limiter.keys[1]);
  });
});

describe("handleRequest の HTTPS の要求", () => {
  function toolsListAt(origin: string): Request {
    return new Request(`${origin}/mcp`, {
      method: "POST",
      headers: { ...MCP_HEADERS, ...BEARER },
      body: rpc("tools/list"),
    });
  }

  it("http で届いたリクエストは 403 で拒否する", async () => {
    for (const origin of [
      "http://ai-rotom.example.workers.dev",
      "http://localhost.example.com",
      "http://192.168.0.1:8787",
    ]) {
      const res = await handleRequest(toolsListAt(origin), ENV);
      expect(res.status).toBe(403);
    }
  });

  it("手元のループバックのホストなら http でも処理する", async () => {
    for (const origin of ["http://localhost:8787", "http://127.0.0.1:8787", "http://[::1]:8787"]) {
      const res = await handleRequest(toolsListAt(origin), ENV);
      expect(res.status).toBe(200);
    }
  });

  it("https ならホストを問わず処理する", async () => {
    const res = await handleRequest(toolsListAt(ORIGIN), ENV);
    expect(res.status).toBe(200);
  });

  it("http を拒否するときは認証より先に拒否する", async () => {
    const res = await handleRequest(
      new Request("http://ai-rotom.example.workers.dev/mcp", { method: "POST", body: "{}" }),
      ENV,
    );
    expect(res.status).toBe(403);
  });
});

describe("handleRequest の ALLOWED_HOSTS", () => {
  function toolsListAt(origin: string): Request {
    return new Request(`${origin}/mcp`, {
      method: "POST",
      headers: { ...MCP_HEADERS, ...BEARER },
      body: rpc("tools/list"),
    });
  }

  it("未設定ならどのホスト名でも処理する", async () => {
    for (const origin of [ORIGIN, "https://other.example"]) {
      const res = await handleRequest(toolsListAt(origin), ENV);
      expect(res.status).toBe(200);
    }
  });

  it("一覧にあるホスト名なら、大文字小文字を問わず処理する", async () => {
    const env = { ...ENV, ALLOWED_HOSTS: "other.example, AI-ROTOM.example.workers.dev" };
    for (const origin of [ORIGIN, "https://Ai-Rotom.Example.Workers.Dev"]) {
      const res = await handleRequest(toolsListAt(origin), env);
      expect(res.status).toBe(200);
    }
  });

  it("一覧にないホスト名は、正しいトークンでも 403 で拒否する", async () => {
    const env = { ...ENV, ALLOWED_HOSTS: "ai-rotom.example.workers.dev" };
    for (const origin of [
      "https://evil.example",
      "https://sub.ai-rotom.example.workers.dev",
      "https://ai-rotom.example.workers.dev.evil.example",
    ]) {
      const res = await handleRequest(toolsListAt(origin), env);
      expect(res.status).toBe(403);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    }
  });

  it("リクエストのポートは無視してホスト名だけで比べる", async () => {
    const env = { ...ENV, ALLOWED_HOSTS: "ai-rotom.example.workers.dev,localhost" };
    for (const origin of ["https://ai-rotom.example.workers.dev:8443", "http://localhost:8787"]) {
      const res = await handleRequest(toolsListAt(origin), env);
      expect(res.status).toBe(200);
    }
  });

  it("ポート付きで書いた要素はホスト名と一致しない", async () => {
    const res = await handleRequest(toolsListAt("http://localhost:8787"), {
      ...ENV,
      ALLOWED_HOSTS: "localhost:8787",
    });
    expect(res.status).toBe(403);
  });

  it("ホスト名を拒否するときは認証より先に拒否する", async () => {
    const res = await handleRequest(
      new Request("https://evil.example/mcp", { method: "POST", body: rpc("tools/list") }),
      { ...ENV, ALLOWED_HOSTS: "ai-rotom.example.workers.dev" },
    );
    expect(res.status).toBe(403);
  });
});

describe("handleRequest の Origin の拒否", () => {
  it("Origin ヘッダーが付いたリクエストは、正しいトークンでも 403 で拒否する", async () => {
    for (const origin of [ORIGIN, "https://evil.example", "null", ""]) {
      const res = await handleRequest(
        mcpRequest("/mcp", rpc("tools/list"), { ...BEARER, origin }),
        ENV,
      );
      expect(res.status).toBe(403);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    }
  });

  it("Origin を拒否するときは認証より先に拒否する", async () => {
    const res = await handleRequest(
      mcpRequest("/mcp", rpc("tools/list"), { origin: "https://evil.example" }),
      ENV,
    );
    expect(res.status).toBe(403);
  });

  it("Origin ヘッダーがなければ処理する", async () => {
    const res = await handleRequest(mcpRequest("/mcp", rpc("tools/list"), BEARER), ENV);
    expect(res.status).toBe(200);
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

describe("handleRequest のリクエスト本文の上限", () => {

  function paddedToolsList(bytes: number): string {
    const body = rpc("tools/list");
    return body + " ".repeat(bytes - body.length);
  }

  it("ちょうど 64 KiB の本文は受け付ける", async () => {
    const res = await handleRequest(
      mcpRequest("/mcp", paddedToolsList(MAX_REQUEST_BODY_BYTES), BEARER),
      ENV,
    );
    expect(res.status).toBe(200);
  });

  it("64 KiB を 1 バイトでも超える本文は 413 を返す", async () => {
    const res = await handleRequest(
      mcpRequest("/mcp", paddedToolsList(MAX_REQUEST_BODY_BYTES + 1), BEARER),
      ENV,
    );
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe(-32000);
  });
});

describe("handleRequest の JSON-RPC バッチ", () => {
  async function postBody(body: string): Promise<Response> {
    return handleRequest(mcpRequest("/mcp", body, BEARER), ENV);
  }

  it("1 件だけのバッチも 400 と Invalid Request のエラーで拒否する", async () => {
    const res = await postBody(`[${rpc("tools/list")}]`);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toMatchObject({ jsonrpc: "2.0", id: null, error: { code: -32600 } });
  });

  it("複数件のバッチはどれも実行せずに 400 で拒否する", async () => {
    const call = JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "get_pokemon_info", arguments: { name: "ガブリアス" } },
    });
    const res = await postBody(`[${rpc("tools/list")},${call}]`);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(Array.isArray(body)).toBe(false);
    expect(body.error.code).toBe(-32600);
  });

  it("空のバッチも 400 で拒否する", async () => {
    const res = await postBody("[]");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(-32600);
  });

  it("JSON として読めない本文は 400 と Parse error を返す", async () => {
    const res = await postBody("{");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(-32700);
  });

  it("1 件のメッセージはこれまでどおり処理する", async () => {
    const res = await postBody(rpc("tools/list"));
    expect(res.status).toBe(200);
    expect((await res.json()).result.tools.length).toBeGreaterThan(0);
  });
});

describe("handleRequest の MCP 応答", () => {
  it("initialize にリモート版の instructions を返す", async () => {
    const res = await handleRequest(mcpRequest("/mcp", INITIALIZE, BEARER), ENV);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.result.instructions).toBe(buildRemoteServerInstructions(true));
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

  it("選出分析は moves のない myParty のメンバーを挙げてエラーにする", async () => {
    const result = await callTool("analyze_selection", {
      myParty: [{ name: "ガブリアス", moves: GARCHOMP_MOVES }, { name: "リザードン" }],
      opponentParty: [{ name: "サーフゴー" }],
      battleFormat: "singles",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("myParty[1] (リザードン) の moves");
    expect(result.content[0].text).not.toContain("myParty[0]");
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

  it("選出分析は moves 引数の技数が上限を超えるとエラーにする", async () => {
    const result = await callTool("analyze_selection", {
      myParty: [{ name: "ガブリアス" }],
      opponentParty: [{ name: "サーフゴー" }],
      battleFormat: "singles",
      moves: { ガブリアス: [...GARCHOMP_MOVES, "アイアンヘッド"] },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      `moves 引数の ガブリアス の技を ${MAX_MOVES_PER_MEMBER} つ以内`,
    );
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

describe("handleRequest の REQUIRE_MOVES", () => {
  async function callAllMoves(env: Record<string, string | boolean>) {
    const res = await handleRequest(
      mcpRequest(
        "/mcp",
        rpc("tools/call", {
          name: "calculate_damage_all_moves",
          arguments: { attacker: { name: "ガブリアス" }, defender: { name: "サーフゴー" } },
        }),
        BEARER,
      ),
      { ...ENV, ...env },
    );
    return (await res.json()).result as { isError?: boolean };
  }

  async function instructionsFor(env: Record<string, string | boolean>): Promise<string> {
    const res = await handleRequest(mcpRequest("/mcp", INITIALIZE, BEARER), { ...ENV, ...env });
    return (await res.json()).result.instructions;
  }

  it("未設定なら技構成を必須にする", async () => {
    expect((await callAllMoves({})).isError).toBe(true);
    expect(await instructionsFor({})).toBe(buildRemoteServerInstructions(true));
  });

  it("false なら技構成なしでも計算し、指定を求める案内も出さない", async () => {
    for (const value of ["false", " FALSE ", false]) {
      expect((await callAllMoves({ REQUIRE_MOVES: value })).isError).toBeUndefined();
      expect(await instructionsFor({ REQUIRE_MOVES: value })).toBe(buildRemoteServerInstructions(false));
    }
  });

  it("false 以外の値なら技構成を必須にする", async () => {
    for (const value of ["true", "", "no", true]) {
      expect((await callAllMoves({ REQUIRE_MOVES: value })).isError).toBe(true);
    }
  });
});
