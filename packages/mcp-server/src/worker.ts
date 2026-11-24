import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createCoreServer } from "./core-server.js";
import { REMOTE_SERVER_INSTRUCTIONS } from "./instructions.js";

export interface Env {
  /** MCP エンドポイントの認証に使う共有トークン。wrangler secret で設定する。 */
  AUTH_TOKEN?: string;
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

async function handleMcp(request: Request): Promise<Response> {
  const server = createCoreServer(REMOTE_SERVER_INSTRUCTIONS, { requireMoves: true });
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

  return handleMcp(request);
}

export default {
  fetch: handleRequest,
};
