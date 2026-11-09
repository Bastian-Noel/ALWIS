import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createCollabHub, normalizeCollabConfig } from "../server/collab-hub.mjs";

const hasWS = typeof globalThis.WebSocket === "function";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot(config = {}) {
  const hub = createCollabHub({ getConfig: () => config });
  const server = createServer((_, res) => res.end());
  server.on("upgrade", (req, sock, head) => hub.handleUpgrade(req, sock, head));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `ws://127.0.0.1:${server.address().port}/collab`;
  return { hub, url, stop: async () => { hub.close(); server.closeAllConnections?.(); await new Promise((r) => server.close(r)); } };
}

function client(url) {
  const ws = new WebSocket(url);
  const inbox = [];
  const waiters = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    inbox.push(m);
    for (const w of [...waiters]) if (w.test(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
  };
  const open = new Promise((r) => (ws.onopen = r));
  return {
    ws, inbox, open,
    send: (o) => ws.send(JSON.stringify(o)),
    next(pred = () => true, ms = 1500) {
      const past = inbox.find(pred);
      if (past) { inbox.splice(inbox.indexOf(past), 1); return Promise.resolve(past); }
      return new Promise((resolve, reject) => {
        const w = { test: pred, resolve: (m) => { inbox.splice(inbox.indexOf(m), 1); clearTimeout(t); resolve(m); } };
        const t = setTimeout(() => reject(new Error("timeout waiting message")), ms);
        waiters.push(w);
      });
    },
    close: () => ws.close(),
  };
}

async function host(url, name = "Alice") {
  const c = client(url);
  await c.open;
  c.send({ t: "host", name });
  const hosted = await c.next((m) => m.t === "hosted");
  return { c, hosted };
}
async function guest(url, room, name, resume) {
  const c = client(url);
  await c.open;
  c.send({ t: "join", room, name, resume });
  const m = await c.next((x) => x.t === "joined" || x.t === "error");
  return { c, m };
}

test("config is clamped", () => {
  const c = normalizeCollabConfig({ maxGuests: 99, graceMs: 1, relayBytesPerSec: "x" });
  assert.equal(c.maxGuests, 12);
  assert.equal(c.graceMs, 1000);
  assert.ok(c.relayBytesPerSec > 0);
});

test("host, guest, roster and signaling (star topology)", { skip: !hasWS }, async () => {
  const s = await boot();
  try {
    const { c: h, hosted } = await host(s.url);
    assert.match(hosted.room, /^[A-Z2-9]{8}$/);
    const { c: g, m } = await guest(s.url, hosted.room, "Bob");
    assert.equal(m.t, "joined");
    const r = await h.next((x) => x.t === "roster" && x.peers.length === 2);
    assert.deepEqual(r.peers.map((p) => p.name), ["Alice", "Bob"]);
    g.send({ t: "sig", to: "h", d: { sdp: "offer" } });
    const got = await h.next((x) => x.t === "sig");
    assert.equal(got.from, m.id);
    assert.deepEqual(got.d, { sdp: "offer" });
    // guests cannot talk to each other
    const { c: g2, m: m2 } = await guest(s.url, hosted.room, "Carl");
    g.send({ t: "relay", to: m2.id, d: 1 });
    assert.equal((await g.next((x) => x.t === "error")).code, "star-only");
    g2.close(); g.close(); h.close();
  } finally { await s.stop(); }
});

test("same name gets a different variant; freed variant is reused", { skip: !hasWS }, async () => {
  const s = await boot();
  try {
    const { c: h, hosted } = await host(s.url, "Sam");
    const a = await guest(s.url, hosted.room, "Sam");
    const b = await guest(s.url, hosted.room, "sam");
    const r = await h.next((x) => x.t === "roster" && x.peers.length === 3);
    assert.deepEqual(r.peers.map((p) => p.variant), [0, 1, 2]);
    b.c.send({ t: "leave" });
    const r2 = await h.next((x) => x.t === "roster" && x.peers.length === 2);
    assert.deepEqual(r2.peers.map((p) => p.variant), [0, 1]);
    const c = await guest(s.url, hosted.room, "Sam");
    const r3 = await h.next((x) => x.t === "roster" && x.peers.length === 3);
    assert.deepEqual(r3.peers.map((p) => p.variant), [0, 1, 2]);
    for (const x of [a, c]) x.c.close(); h.close();
  } finally { await s.stop(); }
});

test("seat is reserved during grace, reclaimable, then released", { skip: !hasWS }, async () => {
  const s = await boot({ maxGuests: 2, graceMs: 1000 });
  try {
    const { c: h, hosted } = await host(s.url);
    const a = await guest(s.url, hosted.room, "A");
    const b = await guest(s.url, hosted.room, "B");
    a.c.ws.close(); // network drop
    const away = await h.next((x) => x.t === "roster" && x.peers.some((p) => p.state === "away"));
    assert.ok(away.peers.find((p) => p.name === "A").awayUntil > Date.now());
    // room is "full" because A's seat is reserved
    const intruder = await guest(s.url, hosted.room, "Z");
    assert.equal(intruder.m.code, "full");
    // A comes back with its token and keeps the same seat id
    const back = await guest(s.url, hosted.room, "A", a.m.resume);
    assert.equal(back.m.id, a.m.id);
    assert.equal(back.m.resumed, true);
    await h.next((x) => x.t === "roster" && x.peers.every((p) => p.state === "online"));
    // now drop again and let grace expire
    back.c.ws.close();
    await h.next((x) => x.t === "peer-down" && x.reason === "grace-expired", 3000);
    const late = await guest(s.url, hosted.room, "A", a.m.resume); // token dead -> new seat
    assert.equal(late.m.t, "joined");
    assert.equal(late.m.resumed, false); // seat was released: a brand-new one is given
    assert.notEqual(late.m.id, a.m.id);
    const full = await guest(s.url, hosted.room, "Z"); // B + late fill the room again
    assert.equal(full.m.code, "full");
    b.c.close();
    await h.next((x) => x.t === "peer-down" && x.reason === "grace-expired", 3000);
    const ok = await guest(s.url, hosted.room, "Z");
    assert.equal(ok.m.t, "joined");
    ok.c.close(); late.c.close(); h.close();
  } finally { await s.stop(); }
});

test("takeover: resume replaces a half-dead connection", { skip: !hasWS }, async () => {
  const s = await boot();
  try {
    const { c: h, hosted } = await host(s.url);
    const a = await guest(s.url, hosted.room, "A");
    const back = await guest(s.url, hosted.room, "A", a.m.resume);
    assert.equal(back.m.id, a.m.id);
    assert.equal((await a.c.next((x) => x.t === "closing")).reason, "replaced");
    back.c.close(); h.close();
  } finally { await s.stop(); }
});

test("host can resume its room; guests see away state; room dies after host grace", { skip: !hasWS }, async () => {
  const s = await boot({ hostGraceMs: 1000 });
  try {
    const { c: h, hosted } = await host(s.url);
    const a = await guest(s.url, hosted.room, "A");
    h.ws.close();
    const r = await a.c.next((x) => x.t === "roster" && x.hostState === "away");
    assert.ok(r);
    const h2 = client(s.url);
    await h2.open;
    h2.send({ t: "host", name: "Alice", room: hosted.room, hostKey: hosted.hostKey });
    assert.equal((await h2.next((x) => x.t === "hosted")).resumed, true);
    await a.c.next((x) => x.t === "roster" && x.hostState === "online");
    h2.ws.close();
    assert.equal((await a.c.next((x) => x.t === "closing", 3000)).reason, "host-timeout");
  } finally { await s.stop(); }
});

test("relay budget throttles, signaling stays free", { skip: !hasWS }, async () => {
  const s = await boot({ relayBytesPerSec: 1024, relayBurstBytes: 4096 });
  try {
    const { c: h, hosted } = await host(s.url);
    const a = await guest(s.url, hosted.room, "A");
    const blob = "x".repeat(3000);
    a.c.send({ t: "relay", to: "h", d: blob, ref: 1 });
    await h.next((x) => x.t === "relay");
    a.c.send({ t: "relay", to: "h", d: blob, ref: 2 });
    const th = await a.c.next((x) => x.t === "throttle");
    assert.equal(th.ref, 2);
    assert.ok(th.retryMs > 0);
    a.c.send({ t: "sig", to: "h", d: { ice: 1 } });
    await h.next((x) => x.t === "sig");
    a.c.close(); h.close();
  } finally { await s.stop(); }
});

test("lock and kick are host-only", { skip: !hasWS }, async () => {
  const s = await boot();
  try {
    const { c: h, hosted } = await host(s.url);
    const a = await guest(s.url, hosted.room, "A");
    a.c.send({ t: "lock", locked: true });
    assert.equal((await a.c.next((x) => x.t === "error")).code, "forbidden");
    h.send({ t: "lock", locked: true });
    await h.next((x) => x.t === "roster" && x.locked);
    assert.equal((await guest(s.url, hosted.room, "B")).m.code, "locked");
    h.send({ t: "kick", id: a.m.id });
    await a.c.next((x) => x.t === "kicked");
    await h.next((x) => x.t === "roster" && x.peers.length === 1);
    h.close();
  } finally { await s.stop(); }
});

test("disabled hub and bad names are refused", { skip: !hasWS }, async () => {
  const off = await boot({ enabled: false });
  try {
    const c = client(off.url);
    const failed = await new Promise((r) => { c.ws.onerror = () => r(true); c.ws.onopen = () => r(false); });
    assert.equal(failed, true);
  } finally { await off.stop(); }
  const s = await boot();
  try {
    const c = client(s.url);
    await c.open;
    c.send({ t: "host", name: "  \u0000  " });
    assert.equal((await c.next((x) => x.t === "error")).code, "name-invalid");
    c.close();
  } finally { await s.stop(); }
});
