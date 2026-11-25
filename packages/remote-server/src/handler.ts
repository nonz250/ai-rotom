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

/** リクエストの数を制限する仕組み。実体は各サービスの機能で用意する。 */
export interface RateLimiter {
  /** key のリクエストを 1 件数え、上限に収まっていれば true を返す。 */
  allow(key: string): Promise<boolean>;
  readonly retryAfterSeconds: number;
}

/** リクエストの接続元の IP アドレスを返す。わからなければ null を返す。取り出し方はサービスごとに違う。 */
export type ClientAddressResolver = (request: Request) => string | null;

const MCP_PATH = "/mcp";

const INSECURE_PROTOCOL = "http:";
/** 手元で動かすときだけ、TLS なしの http を受け付けるホスト名。 */
const LOOPBACK_HOSTNAMES: readonly string[] = ["localhost", "127.0.0.1", "[::1]"];
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
const HTTP_STATUS_FORBIDDEN = 403;
const HTTP_STATUS_NOT_FOUND = 404;
const HTTP_STATUS_METHOD_NOT_ALLOWED = 405;
const HTTP_STATUS_PAYLOAD_TOO_LARGE = 413;
const HTTP_STATUS_TOO_MANY_REQUESTS = 429;
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

/**
 * 長さの違うトークンで早く返すと、比べる時間から長さが漏れる。ハッシュにそろえてから比べる。
 * Workers の crypto.subtle.timingSafeEqual は Web 標準にないので、他のサービスでも動く形で比べる。
 */
function digestsMatch(left: Uint8Array, right: Uint8Array): boolean {
  let diff = 0;
  for (let i = 0; i < left.length; i++) {
    diff |= left[i] ^ right[i];
  }
  return diff === 0;
}

/**
 * レート制限のキーに使うダイジェストの先頭のバイト数。キーは制限の仕組みの側に保存されるので、
 * トークンや接続元のアドレスそのものは渡さない。それらを区別できれば足りるので、先頭だけにする。
 */
const RATE_LIMIT_KEY_BYTES = 8;
const HEX_RADIX = 16;
const HEX_DIGITS_PER_BYTE = 2;

function rateLimitKey(tokenDigest: Uint8Array): string {
  return Array.from(tokenDigest.subarray(0, RATE_LIMIT_KEY_BYTES), (byte) =>
    byte.toString(HEX_RADIX).padStart(HEX_DIGITS_PER_BYTE, "0"),
  ).join("");
}

const IPV6_SEPARATOR = ":";
const IPV6_COMPRESSION = "::";
const IPV4_SEPARATOR = ".";
const IPV6_HEXTETS = 8;
/** IPv6 で数える単位の、先頭の 16 ビットの区切りの数。64 ビットで、1 つの回線に割り当てられる大きさ。 */
const IPV6_NETWORK_HEXTETS = 4;

/**
 * 同じ接続元として数える単位に、アドレスをそろえる。IPv6 は 1 つの回線に先頭 64 ビットの範囲が
 * まとめて割り当てられ、アドレスごとに数えると、範囲の中でアドレスを変えるだけで制限を抜けられる。
 */
function clientNetwork(address: string): string {
  const normalized = address.trim().toLowerCase();
  if (!normalized.includes(IPV6_SEPARATOR)) {
    return normalized;
  }
  const last = normalized.slice(normalized.lastIndexOf(IPV6_SEPARATOR) + 1);
  if (last.includes(IPV4_SEPARATOR)) {
    return last;
  }
  const [head, tail] = normalized.split(IPV6_COMPRESSION);
  const headHextets = head === "" ? [] : head.split(IPV6_SEPARATOR);
  const tailHextets = tail === undefined || tail === "" ? [] : tail.split(IPV6_SEPARATOR);
  const omitted =
    tail === undefined ? 0 : IPV6_HEXTETS - headHextets.length - tailHextets.length;
  const hextets = [...headHextets, ...Array<string>(omitted).fill("0"), ...tailHextets];
  return hextets
    .slice(0, IPV6_NETWORK_HEXTETS)
    .map((hextet) => Number.parseInt(hextet, HEX_RADIX).toString(HEX_RADIX))
    .join(IPV6_SEPARATOR);
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

/** トークンを確かめ、レート制限のキーを返す。認証を通らなければ拒否の応答を返す。 */
async function authenticatedRateLimitKey(
  request: Request,
  pathToken: string | null,
  expected: string | undefined,
): Promise<string | Response> {
  // トークン未設定や推測しやすい短いトークンのまま公開されても、誰でも呼べる状態にはしない。
  if (expected === undefined) {
    return textResponse(
      HTTP_STATUS_SERVICE_UNAVAILABLE,
      `AUTH_TOKEN must be a random value of at least ${MIN_AUTH_TOKEN_LENGTH} characters`,
    );
  }
  const provided = pathToken ?? bearerToken(request);
  if (provided === null) {
    return textResponse(HTTP_STATUS_UNAUTHORIZED, "Unauthorized");
  }
  const [providedDigest, expectedDigest] = await Promise.all([digest(provided), digest(expected)]);
  if (!digestsMatch(providedDigest, expectedDigest)) {
    return textResponse(HTTP_STATUS_UNAUTHORIZED, "Unauthorized");
  }
  // 認証前に数えると、でたらめなトークンを送るたびに別のキーができ、制限として働かない。
  return rateLimitKey(providedDigest);
}

/**
 * 認証なしで受け付けるときの、レート制限のキーを返す。制限がなければ undefined を返す。
 * 受け付けられなければ拒否の応答を返す。
 */
async function anonymousRateLimitKey(
  request: Request,
  pathToken: string | null,
  limited: boolean,
  clientAddressOf: ClientAddressResolver | undefined,
): Promise<string | undefined | Response> {
  // パスにトークンを入れる URL はログに残る。認証なしでは使い道がないので受けない。
  if (pathToken !== null) {
    return textResponse(HTTP_STATUS_NOT_FOUND, "Not Found");
  }
  if (!limited) {
    return undefined;
  }
  const address = clientAddressOf?.(request) ?? null;
  // 1 つのキーにまとめて数えると、誰か 1 人が上限まで使うだけで全員が止まる。
  if (address === null) {
    return textResponse(HTTP_STATUS_SERVICE_UNAVAILABLE, "Client address is unavailable");
  }
  // キーは制限の仕組みの側に保存されるので、アドレスそのものは渡さない。
  return rateLimitKey(await digest(clientNetwork(address)));
}

async function handleRequest(
  request: Request,
  config: RemoteServerConfig,
  rateLimiter: RateLimiter | undefined,
  clientAddressOf: ClientAddressResolver | undefined,
): Promise<Response> {
  const url = new URL(request.url);
  // 平文で届いたトークンは途中で読まれうる。手元での確認だけは TLS なしでも通す。
  if (url.protocol === INSECURE_PROTOCOL && !LOOPBACK_HOSTNAMES.includes(url.hostname)) {
    return textResponse(HTTP_STATUS_FORBIDDEN, "HTTPS is required");
  }

  // Host ヘッダーではなく URL のホスト名で比べる。手前で TLS を外すプロキシの後ろでは Host が
  // 内側の名前になりうるので、https の確認と同じく、クライアントから見た URL を渡してもらう前提にそろえる。
  if (config.allowedHosts !== undefined && !config.allowedHosts.includes(url.hostname)) {
    return textResponse(HTTP_STATUS_FORBIDDEN, "Host is not allowed");
  }

  // ブラウザには対応しないので、Origin の値を許可リストで絞らず、付いていれば `null` でも拒否する。
  // サーバー側で動く MCP クライアントは Origin を付けない。
  if (request.headers.has("origin")) {
    return textResponse(HTTP_STATUS_FORBIDDEN, "Requests from browsers are not supported");
  }

  const pathToken = parseMcpPath(url.pathname);
  if (pathToken === undefined) {
    return textResponse(HTTP_STATUS_NOT_FOUND, "Not Found");
  }

  const key = config.allowAnonymous
    ? await anonymousRateLimitKey(request, pathToken, rateLimiter !== undefined, clientAddressOf)
    : await authenticatedRateLimitKey(request, pathToken, config.authToken);
  if (key instanceof Response) {
    return key;
  }

  if (key !== undefined && rateLimiter !== undefined && !(await rateLimiter.allow(key))) {
    return textResponse(HTTP_STATUS_TOO_MANY_REQUESTS, "Too Many Requests", {
      "retry-after": String(rateLimiter.retryAfterSeconds),
    });
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
 * rateLimiter を渡さなければ、リクエストの数を制限しない。認証なしで受け付けるときは、
 * clientAddressOf で得た接続元ごとに数える。
 */
export function createRequestHandler(
  config: RemoteServerConfig,
  rateLimiter?: RateLimiter,
  clientAddressOf?: ClientAddressResolver,
): RequestHandler {
  return async (request) =>
    withResponseHeaders(await handleRequest(request, config, rateLimiter, clientAddressOf));
}
