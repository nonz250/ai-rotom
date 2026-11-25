import {
  readRequestBody,
  requestBodyTooLargeMessage,
} from "@modelcontextprotocol/sdk/server/requestBody.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
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

/** MCP SDK がリクエスト本文の上限超過に使うのと同じ、実装定義のサーバーエラーのコード。 */
const JSON_RPC_SERVER_ERROR = -32000;

/**
 * すべての応答に付けるヘッダー。応答にはツールの結果やエラーが入るので、途中の
 * キャッシュに残さない。パスにトークンを入れる URL が Referer で外に出ないようにする。
 */
const RESPONSE_HEADERS: Readonly<Record<string, string>> = {
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
};

const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_UNAUTHORIZED = 401;
const HTTP_STATUS_NOT_FOUND = 404;
const HTTP_STATUS_METHOD_NOT_ALLOWED = 405;
const HTTP_STATUS_PAYLOAD_TOO_LARGE = 413;
const HTTP_STATUS_SERVICE_UNAVAILABLE = 503;

function textResponse(status: number, body: string, headers?: HeadersInit): Response {
  return new Response(body, { status, headers });
}

function jsonRpcErrorResponse(status: number, code: number, message: string): Response {
  return Response.json({ jsonrpc: "2.0", error: { code, message }, id: null }, { status });
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

/**
 * 認証に使ったトークンを含まないリクエストを作る。SDK はリクエストの URL とヘッダーを
 * ツールの処理に渡すので、トークンがそこから先に広がらないようにする。
 */
function withoutCredentials(request: Request): Request {
  const headers = new Headers(request.headers);
  headers.delete("authorization");
  return new Request(new URL(MCP_PATH, request.url), { method: request.method, headers });
}

/** 本文を上限まで読んで JSON としてパースする。受け付けられない本文ならエラーの応答を返す。 */
async function readJsonRpcMessage(request: Request): Promise<{ message: unknown } | Response> {
  let message: unknown;
  try {
    const body = await readRequestBody(request, MAX_REQUEST_BODY_BYTES);
    if (body.tooLarge) {
      return jsonRpcErrorResponse(
        HTTP_STATUS_PAYLOAD_TOO_LARGE,
        JSON_RPC_SERVER_ERROR,
        requestBodyTooLargeMessage(MAX_REQUEST_BODY_BYTES),
      );
    }
    message = JSON.parse(body.text);
  } catch {
    return jsonRpcErrorResponse(HTTP_STATUS_BAD_REQUEST, ErrorCode.ParseError, "Parse error: Invalid JSON");
  }
  if (Array.isArray(message)) {
    return jsonRpcErrorResponse(
      HTTP_STATUS_BAD_REQUEST,
      ErrorCode.InvalidRequest,
      "Invalid Request: Batch requests are not supported",
    );
  }
  return { message };
}

async function handleMcp(request: Request, requireMoves: boolean): Promise<Response> {
  // SDK はバッチを 1 リクエストで最大 100 件まで処理してしまう。バッチかどうかは本文を
  // パースしないとわからないため、SDK に任せずここで読む。パース済みの本文を渡すと SDK は
  // 本文の上限を確かめないので、上限もここで確かめる。
  const read = await readJsonRpcMessage(request);
  if (read instanceof Response) {
    return read;
  }

  const server = createCoreServer(buildRemoteServerInstructions(requireMoves), { requireMoves });
  // セッションを持たないので、リクエストごとにサーバーとトランスポートを作って捨てる。
  // SSE で返すとストリームが閉じるまでサーバーを生かす必要があるため、JSON で返させる。
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(withoutCredentials(request), { parsedBody: read.message });
  } finally {
    await server.close();
  }
}

function withResponseHeaders(response: Response): Response {
  // SDK が作った応答のヘッダーは書き換えられるとは限らないので、作り直してから付ける。
  const result = new Response(response.body, response);
  for (const [name, value] of Object.entries(RESPONSE_HEADERS)) {
    result.headers.set(name, value);
  }
  return result;
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
  return async (request) => withResponseHeaders(await handleRequest(request, config));
}
