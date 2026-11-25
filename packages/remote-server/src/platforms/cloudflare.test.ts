import { describe, it, expect } from "vitest";
import worker from "./cloudflare";

const ORIGIN = "https://ai-rotom.example.workers.dev";
const TOKEN = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function toolsList(token: string): Request {
  return new Request(`${ORIGIN}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
}

describe("Cloudflare Workers のエントリ", () => {
  it("env の AUTH_TOKEN で認証してリクエストを処理する", async () => {
    const res = await worker.fetch(toolsList(TOKEN), { AUTH_TOKEN: TOKEN });
    expect(res.status).toBe(200);
  });

  it("env に AUTH_TOKEN がなければ 503 で拒否する", async () => {
    const res = await worker.fetch(toolsList(TOKEN), {});
    expect(res.status).toBe(503);
  });

  function fakeBinding(success: boolean) {
    const calls: { key: string }[] = [];
    return {
      calls,
      async limit(options: { key: string }) {
        calls.push(options);
        return { success };
      },
    };
  }

  it("env の RATE_LIMITER が許せば処理し、トークンを含まないキーだけを渡す", async () => {
    const binding = fakeBinding(true);
    const res = await worker.fetch(toolsList(TOKEN), { AUTH_TOKEN: TOKEN, RATE_LIMITER: binding });

    expect(res.status).toBe(200);
    expect(binding.calls).toHaveLength(1);
    expect(Object.keys(binding.calls[0])).toEqual(["key"]);
    expect(binding.calls[0].key).not.toContain(TOKEN);
  });

  it("env の RATE_LIMITER が拒めば 429 と、wrangler.toml の期間と同じ 60 秒の Retry-After を返す", async () => {
    const res = await worker.fetch(toolsList(TOKEN), {
      AUTH_TOKEN: TOKEN,
      RATE_LIMITER: fakeBinding(false),
    });

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
  });

  it("env に RATE_LIMITER がなければ制限せずに処理する", async () => {
    const res = await worker.fetch(toolsList(TOKEN), { AUTH_TOKEN: TOKEN });
    expect(res.status).toBe(200);
  });
});
