import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createCoreServer } from "@ai-rotom/mcp-core";
import { buildRemoteServerInstructions } from "./instructions.js";

export interface Env {
  /** MCP エンドポイントの認証に使う共有トークン。wrangler secret で設定する。 */
  AUTH_TOKEN?: string;
  /**
   * 全技系ツールで自分側の技構成を必須にするか。false のときだけ任意にする。
   * Workers の無料プランでは、習得技すべての計算が 1 リクエストの CPU 上限を超えるため、未設定なら必須にする。
   * wrangler.toml の [vars] に引用符なしで書くと真偽値で渡ってくるので、文字列と真偽値の両方を受ける。
   */
  REQUIRE_MOVES?: string | boolean;
}

const REQUIRE_MOVES_DISABLED = "false";

function requiresMoves(env: Env): boolean {
  return String(env.REQUIRE_MOVES ?? "").trim().toLowerCase() !== REQUIRE_MOVES_DISABLED;
}

const MCP_PATH = "/mcp";
const BEARER_PATTERN = /^bearer\s+(.+)$/i;

const HTTP_STATUS_UNAUTHORIZED = 401;
const HTTP_STATUS_NOT_FOUND = 404;
const HTTP_STATUS_METHOD_NOT_ALLOWED = 405;
const HTTP_STATUS_SERVICE_UNAVAILABLE = 503;

function textResponse(status: number, body: string, headers?: HeadersInit): Response {
  return new Response(body, { status, headers });
}

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < left.length; i++) {
    diff |= left[i] ^ right[i];
  }
  return diff === 0;
}

/**
 * パスからトークンを取り出す。`/mcp` なら null、`/mcp/<token>` ならそのトークン、
 * それ以外のパスなら undefined を返す。
 */
function parseMcpPath(pathname: string): string | null | undefined {
  if (pathname === MCP_PATH) {
    return null;
  }
  const prefix = `${MCP_PATH}/`;
  if (pathname.startsWith(prefix) && pathname.length > prefix.length) {
    const token = pathname.slice(prefix.length);
    if (token.includes("/")) {
      return undefined;
    }
    try {
      return decodeURIComponent(token);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  const match = header === null ? null : BEARER_PATTERN.exec(header.trim());
  return match === null ? null : match[1];
}

async function handleMcp(request: Request, requireMoves: boolean): Promise<Response> {
  const server = createCoreServer(buildRemoteServerInstructions(requireMoves), { requireMoves });
  // セッションを持たないので、リクエストごとにサーバーとトランスポートを作って捨てる。
  // SSE で返すとストリームが閉じるまでサーバーを生かす必要があるため、JSON で返させる。
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const pathToken = parseMcpPath(new URL(request.url).pathname);
  if (pathToken === undefined) {
    return textResponse(HTTP_STATUS_NOT_FOUND, "Not Found");
  }

  // トークン未設定のまま公開されても、誰でも呼べる状態にはしない。
  const expected = env.AUTH_TOKEN;
  if (expected === undefined || expected === "") {
    return textResponse(HTTP_STATUS_SERVICE_UNAVAILABLE, "AUTH_TOKEN is not configured");
  }
  const provided = pathToken ?? bearerToken(request);
  if (provided === null || !timingSafeEqual(provided, expected)) {
    return textResponse(HTTP_STATUS_UNAUTHORIZED, "Unauthorized");
  }

  // セッションを持たないので、サーバーからの通知を流す GET の SSE と、
  // セッションを終わらせる DELETE は受けない。
  if (request.method !== "POST") {
    return textResponse(HTTP_STATUS_METHOD_NOT_ALLOWED, "Method Not Allowed", { allow: "POST" });
  }

  return handleMcp(request, requiresMoves(env));
}

export default {
  fetch: handleRequest,
};
