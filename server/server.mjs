import { createReadStream } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./", import.meta.url));
const site = resolve(process.env.ALWIS_SITE_DIR ?? resolve(root, "site"));
const dataDir = resolve(process.env.ALWIS_DATA_DIR ?? "/data");
const port = Number(process.env.PORT ?? "3000");
const host = process.env.HOST ?? "0.0.0.0";
const username = process.env.ALWIS_ADMIN_USER ?? "admin";
const adminPassword = process.env.ALWIS_ADMIN_PASSWORD ?? "";
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT doit être compris entre 1 et 65535.");
if (!/^[^:\u0000-\u001f\u007f]{1,64}$/.test(username))
  throw new Error("ALWIS_ADMIN_USER doit contenir de 1 à 64 caractères sans deux-points.");
const trustProxy = process.env.TRUST_PROXY ?? "false";
if (!["true", "false"].includes(trustProxy))
  throw new Error("TRUST_PROXY doit valoir true ou false.");
if (Buffer.byteLength(adminPassword) < 20)
  throw new Error("ALWIS_ADMIN_PASSWORD doit contenir au moins 20 octets.");
await mkdir(dataDir, { recursive: true });

const db = new DatabaseSync(resolve(dataDir, "server.sqlite"));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = FULL;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS server_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const defaults = {
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:3000",
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  maintenance: false,
  logLevel: process.env.ALWIS_LOG_LEVEL ?? "info",
};
const readSettings = db.prepare("SELECT key,value FROM server_settings");
const writeSetting = db.prepare(
  "INSERT INTO server_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
);
function getSettings() {
  const result = structuredClone(defaults);
  for (const row of readSettings.all()) {
    try {
      result[row.key] = JSON.parse(row.value);
    } catch {}
  }
  return result;
}

function validateSettings(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Les réglages doivent être un objet JSON.");
  const keys = Object.keys(input);
  if (keys.some((key) => !["publicBaseUrl", "allowedOrigins", "maintenance", "logLevel"].includes(key)))
    throw new Error("Un réglage inattendu a été fourni.");
  const current = getSettings();
  const result = { ...current };
  if (Object.hasOwn(input, "publicBaseUrl")) {
    if (typeof input.publicBaseUrl !== "string" || input.publicBaseUrl.length > 240)
      throw new Error("Saisissez une URL publique de 240 caractères maximum.");
    let url;
    try {
      url = new URL(input.publicBaseUrl);
    } catch {
      throw new Error("L’URL publique n’est pas valide.");
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    )
      throw new Error("Utilisez une URL HTTPS publique (HTTP est permis sur localhost). ");
    result.publicBaseUrl = url.origin + url.pathname.replace(/\/$/, "");
  }
  if (Object.hasOwn(input, "allowedOrigins")) {
    if (!Array.isArray(input.allowedOrigins) || input.allowedOrigins.length > 16)
      throw new Error("Indiquez au plus 16 origines autorisées.");
    result.allowedOrigins = [...new Set(input.allowedOrigins.map((origin) => {
      if (typeof origin !== "string" || origin.length > 240)
        throw new Error("Chaque origine doit être une URL courte.");
      let url;
      try {
        url = new URL(origin);
      } catch {
        throw new Error("Une origine autorisée n’est pas valide.");
      }
      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
        (url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      )
        throw new Error("Une origine doit contenir uniquement le protocole, l’hôte et le port.");
      return url.origin;
    }))];
  }
  if (Object.hasOwn(input, "maintenance")) {
    if (typeof input.maintenance !== "boolean")
      throw new Error("Le mode maintenance doit être activé ou désactivé.");
    result.maintenance = input.maintenance;
  }
  if (Object.hasOwn(input, "logLevel")) {
    if (!["error", "warn", "info"].includes(input.logLevel))
      throw new Error("Le niveau de journal doit être error, warn ou info.");
    result.logLevel = input.logLevel;
  }
  return result;
}
validateSettings(defaults);

const page = await readFile(new URL("./server-config.html", import.meta.url), "utf8");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};
const digest = (value) => createHash("sha256").update(value).digest();
const expectedUser = digest(username);
const expectedPassword = digest(adminPassword);
function requestOrigin(request) {
  const proxyScheme =
    trustProxy === "true" &&
    ["http", "https"].includes(request.headers["x-forwarded-proto"])
      ? request.headers["x-forwarded-proto"]
      : request.socket.encrypted
        ? "https"
        : "http";
  try {
    return new URL(`${proxyScheme}://${request.headers.host}`).origin;
  } catch {
    return "";
  }
}
function originAllowed(request, settings) {
  const origin = request.headers.origin;
  return !origin || origin === requestOrigin(request) || settings.allowedOrigins.includes(origin);
}
function authenticated(request) {
  const header = request.headers.authorization ?? "";
  const encoded = header.match(/^Basic ([A-Za-z0-9+/]+=*)$/)?.[1];
  if (!encoded) return false;
  let decoded;
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return false;
  }
  const separator = decoded.indexOf(":");
  if (separator < 0) return false;
  return (
    timingSafeEqual(digest(decoded.slice(0, separator)), expectedUser) &&
    timingSafeEqual(digest(decoded.slice(separator + 1)), expectedPassword)
  );
}
function json(response, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
  });
  response.end(body);
}
function log(level, event, fields = {}) {
  const settings = getSettings();
  const priority = { error: 0, warn: 1, info: 2 };
  if (priority[level] <= priority[settings.logLevel])
    process.stdout.write(JSON.stringify({ time: new Date().toISOString(), level, event, ...fields }) + "\n");
}
function basicChallenge(response) {
  response.writeHead(401, {
    "WWW-Authenticate": 'Basic realm="ALWIS Server", charset="UTF-8"',
    "Cache-Control": "no-store",
  });
  response.end("Authentification requise.");
}
async function bodyJSON(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32768) throw new Error("La requête dépasse 32 Kio.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Le corps doit être un objet JSON valide.");
  }
}
async function staticFile(request, response, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }
  const filename = resolve(site, "." + (decoded === "/" ? "/index.html" : decoded));
  if (!filename.startsWith(site + sep)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const info = await stat(filename);
    if (!info.isFile()) throw Error("not a file");
    response.setHeader("Content-Type", mime[extname(filename)] ?? "application/octet-stream");
    response.setHeader("Content-Length", info.size);
    if (pathname === "/service-worker.js") response.setHeader("Service-Worker-Allowed", "/");
    if (request.method === "HEAD") response.end();
    else createReadStream(filename).pipe(response);
  } catch {
    response.writeHead(404).end();
  }
}

const server = createServer(async (request, response) => {
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "POST") {
    response.writeHead(405, { Allow: "GET, HEAD, POST" }).end();
    return;
  }
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  const settings = getSettings();
  const origin = request.headers.origin;
  if (!originAllowed(request, settings)) {
    response.writeHead(403).end("Origine non autorisée.");
    log("warn", "origin_denied");
    return;
  }
  if (settings.maintenance && !["/healthz", "/readyz", "/admin/server", "/api/admin/config"].includes(pathname)) {
    response.writeHead(503, { "Retry-After": "60" }).end("ALWIS est temporairement en maintenance.");
    return;
  }
  if (pathname === "/healthz" || pathname === "/readyz") {
    try {
      db.prepare("SELECT 1").get();
      json(response, 200, { status: "ok", version: process.env.ALWIS_VERSION ?? "server", database: "ok" });
    } catch {
      json(response, 503, { status: "unavailable", database: "error" });
    }
    return;
  }
  if (pathname === "/admin/server" || pathname === "/api/admin/config") {
    if (!authenticated(request)) return basicChallenge(response);
    if (pathname === "/admin/server" && request.method !== "POST") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
      response.end(page);
      return;
    }
    if (pathname === "/api/admin/config" && request.method === "GET") {
      json(response, 200, { settings: getSettings(), version: process.env.ALWIS_VERSION ?? "server" });
      return;
    }
    if (pathname === "/api/admin/config" && request.method === "POST") {
      if (origin && origin !== requestOrigin(request) && !settings.allowedOrigins.includes(origin)) {
        response.writeHead(403).end("Requête intersite refusée.");
        return;
      }
      try {
        const next = validateSettings(await bodyJSON(request));
        const transaction = db.prepare("INSERT INTO server_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at");
        db.exec("BEGIN IMMEDIATE");
        try {
          for (const [key, value] of Object.entries(next))
            transaction.run(key, JSON.stringify(value));
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
        json(response, 200, { settings: next });
        log("info", "settings_updated", { keys: Object.keys(next) });
      } catch (error) {
        json(response, 400, { error: error instanceof Error ? error.message : "Configuration invalide." });
      }
      return;
    }
  }
  if (pathname === "/admin" || pathname === "/admin/") {
    response.writeHead(308, { Location: "/admin/server" }).end();
    return;
  }
  if (request.method === "POST") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  await staticFile(request, response, pathname);
});

server.listen(port, host, () =>
  log("info", "server_started", { host, port, version: process.env.ALWIS_VERSION ?? "server" }),
);
function shutdown(signal) {
  log("info", "shutdown_started", { signal });
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 25000).unref();
}
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
