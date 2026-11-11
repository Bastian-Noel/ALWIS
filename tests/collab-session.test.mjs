import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createCollabHub } from "../server/collab-hub.mjs";
import { CollabSession } from "../apps/studio/collab/session.mjs";
import { colorFor, initial } from "../apps/studio/collab/colors.mjs";

const hasWS = typeof globalThis.WebSocket === "function";
const until = async (fn, ms = 3000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 15)); }
  throw new Error("condition not met");
};

async function boot(config) {
  const hub = createCollabHub({ getConfig: () => config });
  const server = createServer((_, res) => res.end());
  server.on("upgrade", (q, s, h) => hub.handleUpgrade(q, s, h));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  globalThis.location = new URL(`http://127.0.0.1:${server.address().port}/`);
  return { hub, stop: async () => { hub.close(); server.closeAllConnections?.(); await new Promise((r) => server.close(r)); } };
}
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

test("colours are stable per name and differ for duplicates", () => {
  assert.equal(colorFor("Alice").solid, colorFor("alice ").solid);
  assert.notEqual(colorFor("Alice", 0).solid, colorFor("Alice", 1).solid);
  assert.equal(initial("élodie"), "É");
});

test("invite links retain deployment and project query parameters", () => {
  const previous = globalThis.location;
  globalThis.location = new URL("https://studio.example.test/?build=release-42&project=atelier#main");
  try {
    const session = new CollabSession({ path: "/collab" });
    session.room = "ABCD2345";
    const link = new URL(session.inviteUrl());
    assert.equal(link.searchParams.get("build"), "release-42");
    assert.equal(link.searchParams.get("project"), "atelier");
    assert.equal(link.searchParams.get("collab"), "ABCD2345");
    assert.equal(link.hash, "");
  } finally {
    if (previous === undefined) delete globalThis.location;
    else globalThis.location = previous;
  }
});

test("host and guest talk over the relay (no WebRTC) and a guest survives a network drop", { skip: !hasWS }, async () => {
  const s = await boot({ graceMs: 2000 });
  const cfg = { path: "/collab", iceServers: [] };
  try {
    globalThis.sessionStorage = mem(); // host tab
    const host = new CollabSession(cfg, { RTC: null });
    host.host("Alice");
    await until(() => host.status === "live");
    const hostStore = globalThis.sessionStorage;

    globalThis.sessionStorage = mem(); // guest tab
    const guest = new CollabSession(cfg, { RTC: null });
    const got = [];
    host.on("message", (m) => got.push(m));
    guest.join(host.room, "Bob");
    await until(() => guest.status === "live" && host.peers.length === 2);
    await until(() => host.links.size === 1);
    guest.send("h", { t: "hello", name: "Bob" });
    await until(() => got.length === 1);
    assert.equal(got[0].msg.name, "Bob");
    host.send(guest.me.id, { t: "tree", files: ["/a.php"] });
    const back = [];
    guest.on("message", (m) => back.push(m));
    await until(() => back.length === 1);

    // network drop: kill the guest socket abruptly; the host sees "away", not "left"
    guest.sig.ws.close(4000);
    await until(() => host.peer(guest.me.id)?.state === "away");
    // ...and the same seat is reclaimed automatically
    await until(() => host.peer(guest.me.id)?.state === "online", 6000);
    assert.equal(host.peers.length, 2);
    guest.send("h", { t: "hello", name: "Bob again" });
    await until(() => got.length === 2);
    guest.leave();
    await until(() => host.peers.length === 1);
    host.leave();
    void hostStore;
  } finally { await s.stop(); }
});

test("host kick terminates guest signaling instead of automatically rejoining", { skip: !hasWS }, async () => {
  const s = await boot({ hostGraceMs: 2000, graceMs: 2000 });
  let host, guest;
  try {
    globalThis.sessionStorage = mem();
    host = new CollabSession({ path: "/collab", iceServers: [] }, { RTC: null });
    host.host("Owner");
    await until(() => host.status === "live");

    globalThis.sessionStorage = mem();
    guest = new CollabSession({ path: "/collab", iceServers: [] }, { RTC: null });
    guest.join(host.room, "Untrusted guest");
    await until(() => guest.status === "live" && host.peers.length === 2);

    const removedId = guest.me.id;
    host.kick(removedId);
    await until(() => guest.status === "closed" && host.peers.length === 1);
    assert.equal(guest.closedReason, "kicked");
    assert.equal(guest.sig.state, "closed", "kicked clients must not schedule reconnect");
    assert.equal(guest.links.size, 0);
    await new Promise(resolve => setTimeout(resolve, 850)); // catches the default reconnect backoff
    assert.equal(host.peers.length, 1, "kicked guest must not come back");
    assert.equal(guest.sig.state, "closed");
  } finally {
    guest?.leave();
    host?.leave();
    await s.stop();
  }
});


test("acknowledged relay retries throttled messages without dropping them", { skip: !hasWS }, async () => {
  const server = await boot({ relayBytesPerSec: 1024, relayBurstBytes: 4096 });
  const config = { path: "/collab", iceServers: [], relayAcknowledgements: true };
  const host = new CollabSession(config, { RTC: null }), guest = new CollabSession(config, { RTC: null });
  try {
    globalThis.sessionStorage = mem(); host.host("Host");
    await until(() => host.status === "live");
    globalThis.sessionStorage = mem(); guest.join(host.room, "Guest");
    await until(() => guest.status === "live" && host.links.size === 1);
    const messages = []; let throttles = 0;
    host.on("message", ({ msg }) => messages.push(msg));
    guest.on("throttle", ({ ms }) => { if (ms) throttles++; });
    guest.send("h", { id: "one", text: "x".repeat(3000) });
    guest.send("h", { id: "two", text: "x".repeat(3000) });
    await until(() => messages.length === 2, 7000);
    assert.deepEqual(messages.map(message => message.id), ["one", "two"]);
    assert.ok(throttles > 0, "test must exercise actual server throttling");
    assert.equal(guest.links.get("h").outbox.length, 0);
  } finally { guest.leave(); host.leave(); await server.stop(); }
});
