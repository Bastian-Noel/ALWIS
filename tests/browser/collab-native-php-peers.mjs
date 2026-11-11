/**
 * Three actual browser contexts, actual ALWIS Node signaling, two WebRTC peers,
 * HostHttpGateway and native PHP/MariaDB in one owner worker. Only the host
 * loads WebAssembly. Guests get normalized HTTP responses, never PHPSESSID.
 * The runtime can be the historical local QA reference or independent candidate.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { cp, mkdtemp, mkdir, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const runtimeDist = resolve(process.env.ALWIS_PARITY_RUNTIME_DIST
  ?? join(root, "build-work/bridge/.native-build/engine/wasm/runtime-dist"));
for (const file of ["pbl-runtime.wasm", "pbl-runtime.mjs"])
  assert.ok((await stat(join(runtimeDist, file))).size > 0, "Native PHP test requires the actual " + file);
const pw = await import(pathToFileURL(join(root, "build-work/php/node_modules/playwright/index.mjs")).href);
const folder = await mkdtemp(join(tmpdir(), "alwis-real-native-peers-"));
const site = join(folder, "site"), data = join(folder, "data");
await mkdir(site);
await mkdir(data);
await cp(join(root, "packages/runtime/src"), join(site, "packages/runtime/src"), { recursive: true });
await cp(join(root, "apps/studio/collab"), join(site, "collab"), { recursive: true });
await cp(runtimeDist, join(site, "engine"), { recursive: true });
await writeFile(join(site, "index.html"), "<!doctype html><meta charset='utf-8'><title>ALWIS native guest HTTP proof</title>");
const probe = createServer();
await new Promise(ok => probe.listen(0, "127.0.0.1", ok));
const port = probe.address().port;
await new Promise(ok => probe.close(ok));
const origin = "http://127.0.0.1:" + port;
let logs = "";
const server = spawn(process.execPath, ["server/server.mjs"], {
  cwd: root,
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(port),
    ALWIS_ADMIN_PASSWORD: "temporary-native-peers-only-test-password",
    ALWIS_SITE_DIR: site, ALWIS_DATA_DIR: data, PUBLIC_BASE_URL: origin,
    ALWIS_COLLAB: "true", ALWIS_ICE_SERVERS: "[]", TRUST_PROXY: "false" },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", chunk => logs += chunk.toString());
server.stderr.on("data", chunk => logs += chunk.toString());

const php = [
  "<?php",
  "session_start();",
  "$_SESSION['count'] = ($_SESSION['count'] ?? 0) + 1;",
  "$_SESSION['marker'] ??= bin2hex(random_bytes(12));",
  "$pdo = new PDO('mysql:dbname=test', 'root', '');",
  "$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);",
  "$pdo->exec('CREATE TABLE IF NOT EXISTS alwis_browser_guest_events (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, stamp VARCHAR(100) NOT NULL)');",
  "if ($_SERVER['REQUEST_METHOD'] === 'POST') {",
  "  $raw = file_get_contents('php://input');",
  "  $q = $pdo->prepare('INSERT INTO alwis_browser_guest_events(stamp) VALUES(?)');",
  "  $q->execute([bin2hex($raw)]);",
  "} else { $raw = ''; }",
  "$total = (int) $pdo->query('SELECT COUNT(*) FROM alwis_browser_guest_events')->fetchColumn();",
  "header('Content-Type: application/json');",
  "echo json_encode(['marker' => $_SESSION['marker'], 'count' => $_SESSION['count'],",
  "  'method' => $_SERVER['REQUEST_METHOD'], 'body' => bin2hex($raw), 'rows' => $total]);",
].join("\n");

async function setupHost(page) {
  await page.goto(origin + "/");
  await page.evaluate(async ({ origin, php }) => {
    const { NativeRuntime } = await import("/packages/runtime/src/native-runtime.mjs");
    const { CollabSession } = await import("/collab/session.mjs");
    const { HostHttpGateway } = await import("/collab/http-gateway.mjs");
    const rt = await NativeRuntime.create({ moduleURL: origin + "/engine/pbl-runtime.mjs" });
    await rt.write("/workspace/index.php", php);
    const config = await (await fetch("/api/collab/config")).json();
    config.iceServers = [];
    const hub = new CollabSession(config);
    const errors = [];
    const bridge = new HostHttpGateway({
      origin, canPreview: () => true,
      sessions: {
        create: async label => ({ label, privateCookie: null }),
        remove: async () => {},
      },
      route: async (session, request) => {
        const headers = request.headers.slice();
        if (session.privateCookie) headers.push(["Cookie", session.privateCookie]);
        const reply = await rt.request({
          script: "/workspace/index.php", url: request.url,
          method: request.method, headers, body: request.body,
        });
        if (reply.exitCode !== 0) throw Error("Native PHP failed: " + new TextDecoder().decode(reply.stderr).slice(0, 300));
        const decodedHeaders = [];
        for (const line of reply.headers) {
          const i = line.indexOf(":");
          if (i <= 0) continue;
          const key = line.slice(0, i), value = line.slice(i + 1).trim();
          if (key.toLowerCase() === "set-cookie" && value.startsWith("PHPSESSID=")) {
            session.privateCookie = value.split(";")[0];
          } else decodedHeaders.push([key, value]);
        }
        return { status: reply.status, headers: decodedHeaders, body: reply.body };
      },
      send: (peer, frame) => hub.send(peer, frame),
      log: (_level, _event, detail) => errors.push(detail),
    });
    hub.on("message", ({ from, msg }) => {
      Promise.resolve(bridge.receive(from, msg)).catch(error => errors.push({ message: String(error) }));
    });
    hub.host("Native owner");
    window.alwisHost = { rt, hub, bridge, errors };
  }, { origin, php });
  await page.waitForFunction(() => alwisHost.hub.status === "live", null, { timeout: 15000 });
  return await page.evaluate(() => alwisHost.hub.room);
}

async function setupGuest(page, room) {
  await page.goto(origin + "/");
  await page.evaluate(async ({ origin, room }) => {
    const { CollabSession } = await import("/collab/session.mjs");
    const { GuestHttpGateway } = await import("/collab/http-gateway.mjs");
    const config = await (await fetch("/api/collab/config")).json();
    config.iceServers = [];
    const hub = new CollabSession(config);
    const gateway = new GuestHttpGateway({
      origin, timeoutMs: 30_000, send: frame => hub.send("h", frame),
    });
    hub.on("message", ({ msg }) => gateway.receive(msg));
    hub.join(room, "Native PHP guest");
    window.alwisGuest = { hub, gateway };
  }, { origin, room });
  await page.waitForFunction(() => alwisGuest.hub.status === "live", null, { timeout: 15000 });
}

async function guestHTTP(page, method, body) {
  return page.evaluate(async ({ origin, method, body }) => {
    const result = await alwisGuest.gateway.request({
      url: origin + "/index.php", method,
      headers: method === "POST" ? [["Content-Type", "application/octet-stream"]] : [],
      body: body === undefined ? undefined : new Uint8Array(body),
    });
    return { status: result.status, response: JSON.parse(new TextDecoder().decode(result.body)),
      headers: result.headers, publicCookies: result.cookies };
  }, { origin, method, body });
}

async function runBrowser(name) {
  const browser = await pw[name].launch({ headless: true,
    ...(name === "chromium" ? { args: ["--no-sandbox"] } : {}) });
  const contexts = [];
  try {
    for (let i = 0; i < 3; i++) contexts.push(await browser.newContext());
    const [owner, alice, bob] = await Promise.all(contexts.map(ctx => ctx.newPage()));
    for (const page of [owner, alice, bob]) page.setDefaultTimeout(40_000);
    const room = await setupHost(owner);
    await Promise.all([setupGuest(alice, room), setupGuest(bob, room)]);
    await owner.waitForFunction(() => alwisHost.hub.peers.length === 3 && alwisHost.hub.links.size === 2,
      null, { timeout: 15_000 });

    // A signaling seat is not an open WebRTC data channel. This test measures
    // native PHP over established P2P; negotiation buffering is covered by
    // collab-peer-transport and the real workbench/transport journeys.
    await owner.waitForFunction(() => [...alwisHost.hub.links.values()].every(link =>
      !link.negotiating && link.mode === "p2p" && link.dc?.readyState === "open"),
      null, { timeout: 15000 });
    await Promise.all([alice, bob].map(page => page.waitForFunction(() => {
      const link = alwisGuest.hub.links.get("h");
      return link && !link.negotiating && link.mode === "p2p" && link.dc?.readyState === "open";
    }, null, { timeout: 15000 })));

    const [firstA, firstB] = await Promise.all([guestHTTP(alice, "GET"), guestHTTP(bob, "GET")]);
    assert.equal(firstA.status, 200);
    assert.equal(firstB.status, 200);
    assert.equal(firstA.response.count, 1);
    assert.equal(firstB.response.count, 1);
    assert.notEqual(firstA.response.marker, firstB.response.marker, "Each guest must own a distinct PHPSESSID");
    for (const result of [firstA, firstB]) {
      assert.equal(result.publicCookies?.length ?? 0, 0, "Host-only PHP session cookie leaked");
      assert.ok(!result.headers.some(([key]) => key.toLowerCase() === "set-cookie"));
    }

    const postA = await guestHTTP(alice, "POST", [0, 127, 128, 255]);
    assert.equal(postA.response.count, 2);
    assert.equal(postA.response.marker, firstA.response.marker);
    assert.equal(postA.response.body, "007f80ff");
    assert.equal(postA.response.rows, 1);
    const postB = await guestHTTP(bob, "POST", [45, 0, 254]);
    assert.equal(postB.response.count, 2);
    assert.equal(postB.response.marker, firstB.response.marker);
    assert.equal(postB.response.body, "2d00fe");
    assert.equal(postB.response.rows, 2);
    const againA = await guestHTTP(alice, "GET");
    assert.equal(againA.response.marker, firstA.response.marker);
    assert.equal(againA.response.count, 3);
    assert.equal(againA.response.rows, 2);

    const state = await owner.evaluate(() => alwisHost.rt.state());
    assert.equal(state.sqlConnections, 0);
    assert.equal(state.nativeStatements, 0);
    assert.deepEqual(await owner.evaluate(() => alwisHost.errors), []);
    const modes = await Promise.all([alice, bob].map(page =>
      page.evaluate(() => alwisGuest.hub.links.get("h")?.mode)));
    assert.deepEqual(modes, ["p2p", "p2p"],
      "Both native PHP guest sessions must use actual WebRTC data channels");
    console.log(name, "NATIVE PHP PDO/MariaDB OVER TWO GUEST BROWSERS: PASS",
      JSON.stringify({ sessionsDistinct: true, perGuestCounters: [3, 2],
        sharedSQLRows: 2, binaryPosts: true, phpCookiesPrivate: true, modes }));
  } finally {
    await Promise.allSettled(contexts.map(ctx => ctx.close()));
    await browser.close();
  }
}

try {
  let ready = false;
  for (let i = 0; i < 160; i++) {
    if (server.exitCode !== null) throw Error("Native guest server exited: " + logs);
    try { if ((await fetch(origin + "/readyz")).ok) { ready = true; break; } }
    catch { /* waiting for temporary server */ }
    await new Promise(ok => setTimeout(ok, 75));
  }
  assert.ok(ready, "Actual ALWIS server unavailable: " + logs);
  for (const name of (process.argv[2] ?? "chromium,firefox").split(","))
    await runBrowser(name);
} finally {
  if (server.exitCode === null && server.signalCode === null) {
    server.kill("SIGTERM");
    await Promise.race([new Promise(ok => server.once("exit", ok)),
      new Promise(ok => setTimeout(ok, 2600))]);
  }
  await rm(folder, { recursive: true, force: true });
}
