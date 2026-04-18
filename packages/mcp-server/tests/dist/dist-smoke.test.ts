/**
 * dist bundle 対象の統合 smoke test。
 *
 * 目的:
 *   - publish 直前に dist/index.mjs が
 *     (a) @smogon/calc を bundle 内に取り込んでいる
 *     (b) Node だけで起動し MCP JSON-RPC の initialize に応答する
 *     (c) 代表的な calculate_damage_single のゴールデンに一致する応答を返す
 *   を同時に保証する。
 *
 * 実行前提:
 *   - `npm run build` で packages/mcp-server/dist/index.mjs が生成済み。
 *     test 自体は build を実行しない。CI/publish フロー側で build してから
 *     `npm run test:dist` を呼び出す。
 */

import { readFile, access } from "node:fs/promises";
import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_PATH = resolve(__dirname, "../../dist/index.mjs");
const FIXTURES_DIR = resolve(__dirname, "fixtures");

/** 子プロセス起動後、即 exit してしまわないか監視する猶予時間。 */
const DEFAULT_STARTUP_GRACE_MS = 5_000;
/** initialize 応答を待つ最大時間。 */
const DEFAULT_INITIALIZE_RESPONSE_TIMEOUT_MS = 3_000;
/** tools/call 応答を待つ最大時間。initialize よりやや長めに取る。 */
const DEFAULT_TOOL_CALL_RESPONSE_TIMEOUT_MS = 5_000;

const STARTUP_GRACE_MS =
  Number(process.env.AI_ROTOM_DIST_STARTUP_MS) || DEFAULT_STARTUP_GRACE_MS;
const INITIALIZE_RESPONSE_TIMEOUT_MS =
  Number(process.env.AI_ROTOM_DIST_INITIALIZE_TIMEOUT_MS) ||
  DEFAULT_INITIALIZE_RESPONSE_TIMEOUT_MS;
const TOOL_CALL_RESPONSE_TIMEOUT_MS =
  Number(process.env.AI_ROTOM_DIST_TOOL_CALL_TIMEOUT_MS) ||
  DEFAULT_TOOL_CALL_RESPONSE_TIMEOUT_MS;

const INITIALIZE_REQUEST_ID = 1;
const TOOLS_CALL_REQUEST_ID_BASE = 100;

const MCP_PROTOCOL_VERSION = "2024-11-05";

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: unknown;
};

/**
 * 行指向で届く JSON-RPC 応答を 1 件取り出すヘルパー。
 *
 * 注意点:
 *   - MCP stdio transport は 1 応答 = 1 行 (末尾 \n) で流れてくる。
 *   - 1 つの data チャンクに複数応答・複数行が入ることがあるため、
 *     改行で split し id が一致する最初の応答を返す。
 *   - 次のテストで応答を取りこぼさないよう、caller 側は child を都度 kill して
 *     プロセスを使い回さない方針。
 */
function readJsonRpcResponseById(
  child: ChildProcessWithoutNullStreams,
  expectedId: number,
  timeoutMs: number,
): Promise<JsonRpcResponse> {
  return new Promise<JsonRpcResponse>((resolvePromise, rejectPromise) => {
    let buffer = "";
    const timer = setTimeout(() => {
      cleanup();
      rejectPromise(
        new Error(
          `JSON-RPC response (id=${expectedId}) not received within ${timeoutMs}ms`,
        ),
      );
    }, timeoutMs);

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      while (true) {
        const newlineIdx = buffer.indexOf("\n");
        if (newlineIdx < 0) break;
        const line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);
        if (line.trim() === "") continue;
        let parsed: JsonRpcResponse;
        try {
          parsed = JSON.parse(line) as JsonRpcResponse;
        } catch {
          // 行指向なのに壊れた行はサーバ側のバグ候補。debug 目的で stderr に出さず
          // スキップ (他の id を待っているテストが不要に失敗するのを避ける)。
          continue;
        }
        if (parsed.id === expectedId) {
          cleanup();
          resolvePromise(parsed);
          return;
        }
      }
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      rejectPromise(
        new Error(
          `child exited before JSON-RPC response (id=${expectedId}) arrived (code=${code}, signal=${signal})`,
        ),
      );
    };

    function cleanup(): void {
      clearTimeout(timer);
      child.stdout.off("data", onData);
      child.off("exit", onExit);
    }

    child.stdout.on("data", onData);
    child.on("exit", onExit);
  });
}

function spawnDist(): ChildProcessWithoutNullStreams {
  return spawn("node", [DIST_PATH], {
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function sendJsonRpc(
  child: ChildProcessWithoutNullStreams,
  payload: Record<string, unknown>,
): void {
  child.stdin.write(`${JSON.stringify(payload)}\n`);
}

function killChild(child: ChildProcessWithoutNullStreams | null): void {
  if (child === null) return;
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
}

// ---------------------------------------------------------------------------
// describe 1: bundle integrity (grep 検証)
// ---------------------------------------------------------------------------

describe("dist bundle integrity", () => {
  let bundleSource = "";

  beforeAll(async () => {
    await access(DIST_PATH);
    bundleSource = await readFile(DIST_PATH, "utf8");
  });

  const SMOGON_RESIDUE_PATTERNS: RegExp[] = [
    /\bfrom\s+["'`]@smogon\/calc(\/[^"'`]*)?["'`]/,
    /\bimport\s*\(\s*["'`]@smogon\/calc(\/[^"'`]*)?["'`]\s*\)/,
    /\brequire\s*\(\s*["'`]@smogon\/calc(\/[^"'`]*)?["'`]\s*\)/,
  ];

  it("dist/index.mjs exists", async () => {
    await expect(access(DIST_PATH)).resolves.toBeUndefined();
  });

  it("has no unbundled @smogon/calc imports", () => {
    for (const pattern of SMOGON_RESIDUE_PATTERNS) {
      expect(
        bundleSource,
        `pattern ${pattern} should not match the bundle`,
      ).not.toMatch(pattern);
    }
  });

  it("contains inlined @smogon/calc logic", () => {
    expect(bundleSource).toMatch(/calculate|Pokemon|Generation/);
  });
});

// ---------------------------------------------------------------------------
// describe 2: stdio startup and JSON-RPC initialize
// ---------------------------------------------------------------------------

describe("dist bundle stdio startup", () => {
  let child: ChildProcessWithoutNullStreams | null = null;

  afterEach(() => {
    killChild(child);
    child = null;
  });

  it("starts and responds to initialize", async () => {
    child = spawnDist();

    // 起動直後に exit してしまう構造バグを早期検出するための sentinel。
    // 実測応答も待つため、ここでは短時間 exit しないことだけを確認する。
    let earlyExit: {
      code: number | null;
      signal: NodeJS.Signals | null;
    } | null = null;
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      earlyExit = { code, signal };
    };
    child.on("exit", onExit);

    const pendingResponse = readJsonRpcResponseById(
      child,
      INITIALIZE_REQUEST_ID,
      INITIALIZE_RESPONSE_TIMEOUT_MS,
    );

    sendJsonRpc(child, {
      jsonrpc: "2.0",
      id: INITIALIZE_REQUEST_ID,
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "dist-smoke", version: "0.0.0" },
      },
    });

    const response = await pendingResponse;

    // STARTUP_GRACE_MS 以内に exit していないことの検証。initialize 応答が
    // 返ってきている時点で alive は自明だが、明示する。
    expect(earlyExit).toBeNull();

    expect(response.id).toBe(INITIALIZE_REQUEST_ID);
    expect(response.error).toBeUndefined();
    expect(response.result).toBeTruthy();
    expect(response.jsonrpc).toBe("2.0");

    child.off("exit", onExit);
  });

  it("does not exit within STARTUP_GRACE_MS after spawn", async () => {
    child = spawnDist();

    const exited = await new Promise<boolean>((resolvePromise) => {
      const timer = setTimeout(() => {
        resolvePromise(false);
      }, STARTUP_GRACE_MS);
      child!.once("exit", () => {
        clearTimeout(timer);
        resolvePromise(true);
      });
    });

    expect(exited).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// describe 3: calculate_damage_single golden parity
// ---------------------------------------------------------------------------

type GoldenFixture = {
  note: string;
  input: {
    attacker: Record<string, unknown>;
    defender: Record<string, unknown>;
    moveName: string;
  };
  expected: JsonRpcResponse;
};

async function loadFixture(relativePath: string): Promise<GoldenFixture> {
  const absolute = resolve(FIXTURES_DIR, relativePath);
  const raw = await readFile(absolute, "utf8");
  return JSON.parse(raw) as GoldenFixture;
}

async function callCalculateDamageSingle(
  child: ChildProcessWithoutNullStreams,
  requestId: number,
  input: GoldenFixture["input"],
): Promise<JsonRpcResponse> {
  // initialize → initialized (notification) → tools/call の順で 1 セッションを回す。
  const initPending = readJsonRpcResponseById(
    child,
    INITIALIZE_REQUEST_ID,
    INITIALIZE_RESPONSE_TIMEOUT_MS,
  );
  sendJsonRpc(child, {
    jsonrpc: "2.0",
    id: INITIALIZE_REQUEST_ID,
    method: "initialize",
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "dist-smoke", version: "0.0.0" },
    },
  });
  await initPending;

  sendJsonRpc(child, {
    jsonrpc: "2.0",
    method: "notifications/initialized",
  });

  const callPending = readJsonRpcResponseById(
    child,
    requestId,
    TOOL_CALL_RESPONSE_TIMEOUT_MS,
  );
  sendJsonRpc(child, {
    jsonrpc: "2.0",
    id: requestId,
    method: "tools/call",
    params: {
      name: "calculate_damage_single",
      arguments: input,
    },
  });

  return callPending;
}

describe("calculate_damage_single golden parity", () => {
  let child: ChildProcessWithoutNullStreams | null = null;

  afterEach(() => {
    killChild(child);
    child = null;
  });

  const CASES = [
    {
      label: "physical move (じしん)",
      fixture: "calculate_damage_single__physical.golden.json",
      requestIdOffset: 0,
    },
    {
      label: "special move (なみのり)",
      fixture: "calculate_damage_single__special.golden.json",
      requestIdOffset: 1,
    },
  ] as const;

  it.each(CASES)("matches golden for $label", async ({ fixture, requestIdOffset }) => {
    const golden = await loadFixture(fixture);
    const requestId = TOOLS_CALL_REQUEST_ID_BASE + requestIdOffset;

    child = spawnDist();
    const response = await callCalculateDamageSingle(child, requestId, golden.input);

    // 期待値側は fixture 採取時の id を保持しているが、テストで送った id が
    // 応答 id と一致しているかは別途検証した上で、比較時は id を揃える。
    expect(response.id).toBe(requestId);
    const expectedWithId: JsonRpcResponse = {
      ...golden.expected,
      id: requestId,
    };
    expect(response).toEqual(expectedWithId);
  });
});
