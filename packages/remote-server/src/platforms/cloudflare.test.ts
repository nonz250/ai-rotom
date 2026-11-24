import { describe, it, expect } from "vitest";
import worker from "./cloudflare";

const ORIGIN = "https://ai-rotom.example.workers.dev";

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
    const res = await worker.fetch(toolsList("secret"), { AUTH_TOKEN: "secret" });
    expect(res.status).toBe(200);
  });

  it("env に AUTH_TOKEN がなければ 503 で拒否する", async () => {
    const res = await worker.fetch(toolsList("secret"), {});
    expect(res.status).toBe(503);
  });
});
