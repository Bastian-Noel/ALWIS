/**
 * Real ALWIS Node server + two independent browser contexts using the
 * production CollabSession / Signaling / PeerLink JavaScript and WebSocket.
 * Covers P2P-or-relay negotiation, enforced relay, guest reconnect and kick.
 * Does not claim to execute native PHP or verify guest PHP session isolation.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, copyFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const playwright = await import(pathToFileURL(
  join(root, "build-work/php/node_modules/playwright/index.mjs")).href);
const tmp = await mkdtemp(join(tmpdir(), "alwis-real-peers-"));
const site = join(tmp, "site");
const data = join(tmp, "data");
await mkdir(site);
await mkdir(data);
await copyFile(join(root, "apps/studio/collab/transport.mjs"), join(site, "transport.mjs"));
await copyFile(join(root, "apps/studio/collab/session.mjs"), join(site, "session.mjs"));
await writeFile(join(site, "index.html"),
  "<!doctype html><meta charset='utf-8'><title>ALWIS real browser peers</title>");
const probe = createServer();
await new Promise(ok => probe.listen(0, "127.0.0.1", ok));
const port = probe.address().port;
await new Promise(ok => probe.close(ok));
const origin = "http://127.0.0.1:" + port;
let logs = "";
const server = spawn(process.execPath, ["server/server.mjs"], {
  cwd: root,
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(port),
    ALWIS_ADMIN_PASSWORD: "temporary-peers-testing-password-not-production",
    ALWIS_SITE_DIR: site, ALWIS_DATA_DIR: data,
    PUBLIC_BASE_URL: origin, ALWIS_COLLAB: "true",
    ALWIS_COLLAB_GRACE_SECONDS: "5", ALWIS_COLLAB_HOST_GRACE_SECONDS: "5",
    ALWIS_ICE_SERVERS: "[]", TRUST_PROXY: "false" },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", b => logs += b.toString());
server.stderr.on("data", b => logs += b.toString());

async function startClient(page, role, room, rtc) {
  await page.goto(origin + "/");
  await page.evaluate(async ({ role, room, rtc }) => {
    const { CollabSession } = await import("/session.mjs");
    const config = await (await fetch("/api/collab/config")).json();
    if (!config.enabled) throw Error("Real server collaboration not enabled");
    config.iceServers = []; // loopback only, no public STUN/TURN dependency
    const s = new CollabSession(config, { RTC: rtc ? RTCPeerConnection : null });
    window.realPeers = { session: s, messages: [], statuses: [], modes: [], errors: [] };
    s.on("status", (state, reason) => realPeers.statuses.push({ state, reason }));
    s.on("message", message => realPeers.messages.push(message));
    s.on("mode", mode => realPeers.modes.push(mode));
    s.on("error", error => realPeers.errors.push(error));
    if (role === "host") s.host("Owner");
    else s.join(room, "Guest");
  }, { role, room, rtc });
  await page.waitForFunction(() => window.realPeers?.session.status === "live",
    null, { timeout: 15000 });
}

async function exchange(browser, rtc, name) {
  const hctx = await browser.newContext();
  const gctx = await browser.newContext();
  const host = await hctx.newPage(), guest = await gctx.newPage();
  host.setDefaultTimeout(14000);
  guest.setDefaultTimeout(14000);
  const pageErrors = [];
  for (const page of [host, guest]) page.on("pageerror", err => pageErrors.push(err.message));
  try {
    await startClient(host, "host", null, rtc);
    const room = await host.evaluate(() => realPeers.session.room);
    assert.match(room, /^[A-Z2-9]{8}$/);
    await startClient(guest, "guest", room, rtc);
    const guestId = await guest.evaluate(() => realPeers.session.me.id);
    await host.waitForFunction(id => realPeers.session.links.has(id), guestId);
    assert.equal(await host.evaluate(() => realPeers.session.peers.length), 2);

    const tag1 = "browser-peer-" + name + "-" + (rtc ? "rtc" : "relay");
    await guest.evaluate(tag => {
      if (!realPeers.session.send("h", { type: "guest-to-owner", tag }))
        throw Error("Cannot send to real host link");
    }, tag1);
    await host.waitForFunction(tag => realPeers.messages.some(m => m.msg?.tag === tag),
      tag1, { timeout: 15000 });
    const ownerReceived = await host.evaluate(tag =>
      realPeers.messages.filter(m => m.msg?.tag === tag).length, tag1);
    assert.equal(ownerReceived, 1, "Guest frame must reach host exactly once");

    const tag2 = "reply-to-" + tag1;
    await host.evaluate(({ id, tag }) => {
      if (!realPeers.session.send(id, { type: "owner-to-guest", tag }))
        throw Error("Cannot send to real guest link");
    }, { id: guestId, tag: tag2 });
    await guest.waitForFunction(tag => realPeers.messages.some(m => m.msg?.tag === tag),
      tag2, { timeout: 15000 });
    assert.equal(await guest.evaluate(tag => realPeers.messages.filter(m => m.msg?.tag === tag).length, tag2), 1);

    const initialMode = await guest.evaluate(() => realPeers.session.links.get("h")?.mode);
    if (!rtc) {
      assert.equal(initialMode, "relay", "RTC-disabled path must use the real WebSocket relay");
      await guest.evaluate(() => realPeers.session.sig.ws.close(4000, "simulate drop"));
      await guest.waitForFunction(() => realPeers.statuses.some(event => event.state === "reconnecting"),
        null, { timeout: 8000 });
      await guest.waitForFunction(() => realPeers.session.status === "live"
        && realPeers.session.sig.state === "open", null, { timeout: 10000 });
      await host.waitForFunction(id => realPeers.session.peer(id)?.state === "online",
        guestId, { timeout: 10000 });
      assert.equal(await guest.evaluate(() => realPeers.session.me.id), guestId,
        "Reconnect must reclaim original guest seat");
      const afterResume = "reconnected-" + tag1;
      await guest.evaluate(tag => realPeers.session.send("h", { type: "resume", tag }), afterResume);
      await host.waitForFunction(tag => realPeers.messages.some(m => m.msg?.tag === tag),
        afterResume, { timeout: 10000 });
      assert.equal(await host.evaluate(tag => realPeers.messages.filter(m => m.msg?.tag === tag).length,
        afterResume), 1, "Reconnected guest must not replay its request");
    }

    await host.evaluate(id => realPeers.session.kick(id), guestId);
    await guest.waitForFunction(() => realPeers.session.status === "closed",
      null, { timeout: 10000 });
    assert.equal(await guest.evaluate(() => realPeers.session.sig.state), "closed",
      "An explicitly kicked browser must never reconnect automatically");
    await host.waitForFunction(() => realPeers.session.peers.length === 1,
      null, { timeout: 10000 });
    await guest.waitForTimeout(850);
    assert.equal(await host.evaluate(() => realPeers.session.peers.length), 1,
      "Revoked browser must remain excluded after reconnect backoff");
    assert.deepEqual(pageErrors, []);
    console.log(name, rtc ? "WebRTC negotiation" : "forced relay",
      "REAL TWO-BROWSER PEER TEST: PASS",
      JSON.stringify({ guestId, initialMode, ownerReceived,
        statuses: await guest.evaluate(() => realPeers.statuses.map(s => s.state)) }));
  } finally {
    await Promise.allSettled([host.evaluate(() => realPeers?.session?.leave()),
      guest.evaluate(() => realPeers?.session?.leave())]);
    await Promise.allSettled([hctx.close(), gctx.close()]);
  }
}

try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw Error("Actual ALWIS server exited: " + logs);
    try { if ((await fetch(origin + "/readyz")).ok) { ready = true; break; } }
    catch { /* still starting */ }
    await new Promise(ok => setTimeout(ok, 75));
  }
  assert.ok(ready, "Actual ALWIS server startup failed: " + logs);
  for (const name of (process.argv[2] ?? "chromium,firefox").split(",")) {
    const browser = await playwright[name].launch({ headless: true,
      ...(name === "chromium" ? { args: ["--no-sandbox"] } : {}) });
    try {
      await exchange(browser, true, name);
      await exchange(browser, false, name);
    } finally { await browser.close(); }
  }
} finally {
  if (server.exitCode === null && server.signalCode === null) {
    server.kill("SIGTERM");
    await Promise.race([
      new Promise(ok => server.once("exit", ok)),
      new Promise(ok => setTimeout(ok, 2500)),
    ]);
  }
  await rm(tmp, { recursive: true, force: true });
}
