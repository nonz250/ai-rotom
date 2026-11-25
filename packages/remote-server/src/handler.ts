import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createCoreServer } from "@ai-rotom/mcp-core";
import { MIN_AUTH_TOKEN_LENGTH, type RemoteServerConfig } from "./config.js";
import { buildRemoteServerInstructions } from "./instructions.js";

/** Web 標準の Request を受けて Response を返す関数。多くの Workers 系サービスがこの形でリクエストを渡す。 */
export type RequestHandler = (request: Request) => Promise<Response>;

const MCP_PATH = "/mcp";
const BEARER_PATTERN = /^bearer\s+(.+)$/i;

const BYTES_PER_KIBIBYTE = 1024;
/**
 * リクエスト本文の上限。正規のリクエストで最も大きい、育成情報と技構成をすべて書いた
 * 6 対 6 の選出分析でも 15 KiB ほどなので、4 倍余裕を持たせた。
 */
const MAX_REQUEST_BODY_KIBIBYTES = 64;
const MAX_REQUEST_BODY_BYTES = MAX_REQUEST_BODY_KIBIBYTES * BYTES_PER_KIBIBYTE;

const HTTP_STATUS_UNAUTHORIZED = 401;
const HTTP_STATUS_NOT_FOUND = 404;
const HTTP_STATUS_METHOD_NOT_ALLOWED = 405;
const HTTP_STATUS_SERVICE_UNAVAILABLE = 503;

function textResponse(status: number, body: string, headers?: HeadersInit): Response {
  return new Response(body, { status, headers });
}

const TOKEN_DIGEST_ALGORITHM = "SHA-256";

async function digest(value: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest(TOKEN_DIGEST_ALGORITHM, data));
}

async function tokensMatch(provided: string, expected: string): Promise<boolean> {
  // 長さの違うトークンで早く返すと、比べる時間から長さが漏れる。ハッシュにそろえてから比べる。
  // Workers の crypto.subtle.timingSafeEqual は Web 標準にないので、他のサービスでも動く形で比べる。
  const [left, right] = await Promise.all([digest(provided), digest(expected)]);
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
    maxRequestBodySize: MAX_REQUEST_BODY_BYTES,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}

async function handleRequest(request: Request, config: RemoteServerConfig): Promise<Response> {
  const pathToken = parseMcpPath(new URL(request.url).pathname);
  if (pathToken === undefined) {
    return textResponse(HTTP_STATUS_NOT_FOUND, "Not Found");
  }

  // トークン未設定や推測しやすい短いトークンのまま公開されても、誰でも呼べる状態にはしない。
  const expected = config.authToken;
  if (expected === undefined) {
    return textResponse(
      HTTP_STATUS_SERVICE_UNAVAILABLE,
      `AUTH_TOKEN must be a random value of at least ${MIN_AUTH_TOKEN_LENGTH} characters`,
    );
  }
  const provided = pathToken ?? bearerToken(request);
  if (provided === null || !(await tokensMatch(provided, expected))) {
    return textResponse(HTTP_STATUS_UNAUTHORIZED, "Unauthorized");
  }

  // セッションを持たないので、サーバーからの通知を流す GET の SSE と、
  // セッションを終わらせる DELETE は受けない。
  if (request.method !== "POST") {
    return textResponse(HTTP_STATUS_METHOD_NOT_ALLOWED, "Method Not Allowed", { allow: "POST" });
  }

  return handleMcp(request, config.requireMoves);
}

/**
 * リモート版の MCP サーバーのリクエストハンドラーを作る。
 * 実行環境に依存する処理は含まないので、各サービスのエントリから設定を渡して使う。
 */
export function createRequestHandler(config: RemoteServerConfig): RequestHandler {
  return (request) => handleRequest(request, config);
}
