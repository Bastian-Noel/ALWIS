import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, statfs } from "node:fs/promises";
import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { createCollabHub } from "./collab-hub.mjs";

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
// A separate origin is mandatory when rendering untrusted guest PHP/JS.
const previewOrigin = (() => {
  const value = process.env.ALWIS_PREVIEW_ORIGIN?.trim();
  if (!value) return null; // disabled until DNS/TLS and reverse proxy are configured
  const url = new URL(value);
  const configuredStudio = new URL(process.env.PUBLIC_BASE_URL ?? "http://localhost:3000");
  if (value !== url.origin || url.username || url.password || url.search || url.hash
      || url.origin === configuredStudio.origin
      || (url.protocol !== "https:" &&
          !(url.protocol === "http:" && (url.hostname === "localhost" || url.hostname.endsWith(".localhost") || ["127.0.0.1", "[::1]"].includes(url.hostname))))) {
    throw Error("ALWIS_PREVIEW_ORIGIN doit être une origine HTTPS distincte du studio (HTTP localhost seulement).");
  }
  return url.origin;
})();
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
  collabEnabled: process.env.ALWIS_COLLAB !== "false",
  collabMaxGuests: Number(process.env.ALWIS_COLLAB_MAX_GUESTS ?? "6"),
  collabGraceSeconds: Number(process.env.ALWIS_COLLAB_GRACE_SECONDS ?? "45"),
  collabRelayKbps: Number(process.env.ALWIS_COLLAB_RELAY_KBPS ?? "192"),
  collabRelayBurstKib: Number(process.env.ALWIS_COLLAB_RELAY_BURST_KIB ?? "512"),
  collabMaxRooms: Number(process.env.ALWIS_COLLAB_MAX_ROOMS ?? "500"),
  collabMaxConnections: Number(process.env.ALWIS_COLLAB_MAX_CONNECTIONS ?? "2000"),
  collabMaxPerIp: Number(process.env.ALWIS_COLLAB_MAX_PER_IP ?? "40"),
  collabMaxMessageKib: Number(process.env.ALWIS_COLLAB_MAX_MESSAGE_KIB ?? "256"),
  collabMessagesPerSecond: Number(process.env.ALWIS_COLLAB_MESSAGES_PER_SECOND ?? "120"),
  collabHostGraceSeconds: Number(process.env.ALWIS_COLLAB_HOST_GRACE_SECONDS ?? "90"),
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
  if (keys.some((key) => !["publicBaseUrl", "allowedOrigins", "maintenance", "logLevel", "collabEnabled", "collabMaxGuests", "collabGraceSeconds", "collabHostGraceSeconds", "collabRelayKbps", "collabRelayBurstKib", "collabMaxRooms", "collabMaxConnections", "collabMaxPerIp", "collabMaxMessageKib", "collabMessagesPerSecond"].includes(key)))
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
      (url.protocol !== "https:" && !(url.hostname === "localhost" || url.hostname.endsWith(".localhost") || ["127.0.0.1", "[::1]"].includes(url.hostname)))
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
        (url.protocol !== "https:" && !(url.hostname === "localhost" || url.hostname.endsWith(".localhost") || ["127.0.0.1", "[::1]"].includes(url.hostname)))
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
  if (Object.hasOwn(input, "collabEnabled")) {
    if (typeof input.collabEnabled !== "boolean") throw new Error("Le mode multi-utilisateur doit être activé ou désactivé.");
    result.collabEnabled = input.collabEnabled;
  }
  for (const [key, lo, hi, label] of [
    ["collabMaxGuests", 1, 12, "Invités par session : de 1 à 12."],
    ["collabGraceSeconds", 5, 600, "Délai de reprise : de 5 à 600 secondes."],
    ["collabHostGraceSeconds", 5, 1800, "Reprise de l’hôte : de 5 à 1800 secondes."],
    ["collabRelayKbps", 8, 16384, "Débit du relais : de 8 à 16384 Kio/s."],
    ["collabRelayBurstKib", 4, 65536, "Rafale du relais : de 4 à 65536 Kio."],
    ["collabMaxRooms", 1, 10000, "Sessions simultanées : de 1 à 10000."],
    ["collabMaxConnections", 1, 100000, "Connexions simultanées : de 1 à 100000."],
    ["collabMaxPerIp", 1, 10000, "Connexions par adresse : de 1 à 10000."],
    ["collabMaxMessageKib", 1, 4096, "Message maximum : de 1 à 4096 Kio."],
    ["collabMessagesPerSecond", 5, 5000, "Messages par seconde : de 5 à 5000."],
  ])
    if (Object.hasOwn(input, key)) {
      if (!Number.isInteger(input[key]) || input[key] < lo || input[key] > hi) throw new Error(label);
      result[key] = input[key];
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

const iceServers = (() => {
  try {
    const parsed = JSON.parse(process.env.ALWIS_ICE_SERVERS ?? "null");
    if (Array.isArray(parsed)) return parsed.slice(0, 8);
  } catch {}
  return [{ urls: "stun:stun.l.google.com:19302" }];
})();
const collab = createCollabHub({
  log,
  getConfig: () => {
    const s = getSettings();
    return {
      enabled: s.collabEnabled && !s.maintenance,
      maxGuests: s.collabMaxGuests,
      graceMs: s.collabGraceSeconds * 1000,
      hostGraceMs: s.collabHostGraceSeconds * 1000,
      relayBytesPerSec: s.collabRelayKbps * 1024,
      relayBurstBytes: s.collabRelayBurstKib * 1024,
      maxRooms: s.collabMaxRooms,
      maxConnections: s.collabMaxConnections,
      maxPerIp: s.collabMaxPerIp,
      maxMessageBytes: s.collabMaxMessageKib * 1024,
      messagesPerSec: s.collabMessagesPerSecond,
    };
  },
  clientIp: (request) =>
    (trustProxy === "true" && String(request.headers["x-forwarded-for"] ?? "").split(",")[0].trim()) || request.socket.remoteAddress || "?",
  originOk: (request) => originAllowed(request, getSettings()),
});

const server = createServer(async (request, response) => {
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Cache-Control", "no-store");
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  if (previewOrigin && requestOrigin(request) === previewOrigin) {
    // The preview hostname is an untrusted application origin. NEVER serve
    // the studio, administrative API, signaling or sensitive data here.
    response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    response.setHeader("Cache-Control", "no-store");
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    if (pathname === "/guest-sw.js" || pathname === "/guest-broker.html"
      || pathname === "/guest-broker.mjs" || pathname === "/_pbl/client.js") {
      if (pathname === "/guest-broker.html") {
        response.setHeader("Content-Security-Policy",
          "default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self'; "
          + "frame-ancestors " + new URL(process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").origin);
      }
      await staticFile(request, response, pathname);
      return;
    }
    if (pathname.startsWith("/__alwis-guest/")) {
      response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" })
        .end("L'aperçu n'est pas connecté à son Service Worker.");
      return;
    }
    response.writeHead(404).end("Page indisponible sur l'origine d'aperçu.");
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "POST") {
    response.writeHead(405, { Allow: "GET, HEAD, POST" }).end();
    return;
  }
  const settings = getSettings();
  const origin = request.headers.origin;
  if (!originAllowed(request, settings)) {
    response.writeHead(403).end("Origine non autorisée.");
    log("warn", "origin_denied");
    return;
  }
  if (settings.maintenance && !["/healthz", "/readyz", "/admin/server", "/api/admin/config", "/api/admin/status"].includes(pathname)) {
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
  if (pathname === "/admin/server" || pathname === "/api/admin/config" || pathname === "/api/admin/status") {
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
    if (pathname === "/api/admin/status" && request.method === "GET") {
      try {
        const disk = await statfs(dataDir);
        const memory = process.memoryUsage();
        json(response, 200, {
          uptimeSeconds: Math.floor(process.uptime()),
          memory: { rssBytes: memory.rss, heapUsedBytes: memory.heapUsed, heapTotalBytes: memory.heapTotal },
          storage: { totalBytes: disk.blocks * disk.bsize, freeBytes: disk.bavail * disk.bsize },
          collaboration: { enabled: getSettings().collabEnabled && !getSettings().maintenance, ...collab.publicConfig(), ...collab.stats() },
        });
      } catch (error) {
        json(response, 503, { error: error instanceof Error ? error.message : "État indisponible." });
      }
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
  if (pathname === "/api/collab/config" && (request.method === "GET" || request.method === "HEAD")) {
    json(response, 200, { ...collab.publicConfig(), iceServers, path: "/collab", previewOrigin });
    return;
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

server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  if (pathname !== "/collab") return socket.destroy();
  collab.handleUpgrade(request, socket, head);
});
server.listen(port, host, () =>
  log("info", "server_started", { host, port, version: process.env.ALWIS_VERSION ?? "server" }),
);
function shutdown(signal) {
  log("info", "shutdown_started", { signal });
  collab.close();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 25000).unref();
}
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
