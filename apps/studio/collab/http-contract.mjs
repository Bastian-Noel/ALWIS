/**
 * First-party HTTP transport contract for real guest previews.
 *
 * The guest renders real HTML/CSS/JS and may request static assets; PHP, SQL,
 * project files and the virtual cookie jar stay exclusively in the host.
 * This contract is deliberately independent from the current DOM mirror.
 */
export const HTTP_LIMITS = Object.freeze({
  requestBytes: 8 * 1024 * 1024,
  responseBytes: 8 * 1024 * 1024,
  headerBytes: 32 * 1024,
  maxHeaders: 64,
  maxConcurrentPerGuest: 3,
  timeoutMs: 30_000,
});

const METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const BLOCKED_REQUEST_HEADERS = new Set([
  "host", "cookie", "authorization", "proxy-authorization", "connection",
  "transfer-encoding", "upgrade", "forwarded", "x-forwarded-for", "x-forwarded-host",
  "x-forwarded-proto", "content-length", "set-cookie",
]);
const BLOCKED_RESPONSE_HEADERS = new Set([
  "connection", "content-length", "transfer-encoding", "upgrade", "set-cookie",
]);
const validHeader = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

function safeHeaders(input, blocked) {
  if (!Array.isArray(input) || input.length > HTTP_LIMITS.maxHeaders) throw Error("Too many HTTP headers");
  let total = 0;
  return input.map(([name, value]) => {
    if (typeof name !== "string" || !validHeader.test(name) || typeof value !== "string"
      || /[\r\n\0]/.test(value)) throw Error("Invalid HTTP header");
    total += name.length + value.length;
    if (total > HTTP_LIMITS.headerBytes) throw Error("HTTP headers too large");
    return [name, value];
  }).filter(([name]) => !blocked.has(name.toLowerCase()));
}

function byteArray(value, limit) {
  if (value == null) return new Uint8Array();
  if (!Array.isArray(value) && !(value instanceof Uint8Array) && !(value instanceof ArrayBuffer))
    throw Error("Invalid HTTP body");
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : Uint8Array.from(value);
  if (bytes.byteLength > limit) throw Error("HTTP body too large");
  return bytes;
}

/** A guest is not allowed to select its host-side session or send authentication cookies. */
export function normalizeGuestRequest(input, origin) {
  if (!input || typeof input !== "object") throw Error("Invalid HTTP request");
  const url = new URL(input.url, origin);
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== new URL(origin).origin)
    throw Error("Cross-origin guest request denied");
  if (url.username || url.password || url.hash) throw Error("Invalid preview URL");
  const method = String(input.method ?? "GET").toUpperCase();
  if (!METHODS.has(method)) throw Error("Unsupported HTTP method");
  const body = byteArray(input.body, HTTP_LIMITS.requestBytes);
  if (["HEAD", "GET"].includes(method) && body.byteLength) throw Error("GET/HEAD body not allowed");
  if (!/^\/(?!\/)/.test(url.pathname) || /%2f|%5c|%00/i.test(url.pathname))
    throw Error("Invalid preview path");
  return {
    url: url.href,
    method,
    destination: typeof input.destination === "string" ? input.destination.slice(0, 40) : "",
    headers: safeHeaders(input.headers ?? [], BLOCKED_REQUEST_HEADERS),
    body,
  };
}

/** Response is serializable without depending on a DOM or the native WASM. */
export function normalizeHostResponse(input) {
  if (!input || !Number.isInteger(input.status) || input.status < 100 || input.status > 599)
    throw Error("Invalid HTTP response status");
  if (input.file) throw Error("Host must materialize file responses within transport budgets");
  const body = byteArray(input.body, HTTP_LIMITS.responseBytes);
  const headers = safeHeaders(input.headers ?? [], BLOCKED_RESPONSE_HEADERS);
  if ([204, 205, 304].includes(input.status) && body.byteLength) throw Error("Invalid no-content response");
  return { status: input.status, headers, body };
}

/** Do not replay a potentially side-effecting request when a link reconnects. */
export function canReplayHTTP(method) {
  return method === "GET" || method === "HEAD";
}

/** Per-peer session registry: session IDs are assigned by host, never by guest. */
export class GuestSessionRegistry {
  constructor({ create, remove }) {
    this.create = create;
    this.remove = remove;
    this.sessions = new Map();
  }
  async getOrCreate(peerId, name = "Invité") {
    if (!peerId || typeof peerId !== "string") throw Error("Missing verified peer identity");
    if (this.sessions.has(peerId)) return this.sessions.get(peerId);
    const promise = Promise.resolve().then(() => this.create("Invité : " + String(name).slice(0, 60)));
    this.sessions.set(peerId, promise);
    try { return await promise; }
    catch (error) { this.sessions.delete(peerId); throw error; }
  }
  async drop(peerId) {
    const promise = this.sessions.get(peerId);
    if (!promise) return;
    this.sessions.delete(peerId);
    const id = await promise;
    await this.remove(id);
  }
  async close() {
    await Promise.allSettled([...this.sessions.keys()].map((id) => this.drop(id)));
  }
}
