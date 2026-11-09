import test from "node:test";
import assert from "node:assert/strict";
import { ChangeSet, Text } from "@codemirror/state";
import { HostLog, GuestSync } from "../apps/studio/editor/collab-sync.mjs";
import { DocHost, DocGuest } from "../apps/studio/collab/docs.mjs";
import { RpcHost, RpcGuest, installGuestEngine, encode, decode } from "../apps/studio/collab/rpc.mjs";

const lib = { ChangeSet, Text, HostLog, GuestSync };
const peer = (id) => ({ id, name: id, css: "" });

function net() {
  // In-memory wire with an on/off switch per guest and FIFO delivery.
  const wire = { queue: [], up: new Set() };
  wire.pump = async () => { while (wire.queue.length) { const f = wire.queue.shift(); await f(); } };
  return wire;
}

function setup(initial = "line one\nline two\n") {
  const wire = net();
  const guests = {};
  const host = new DocHost({
    lib, peer, editorFor: () => null, onHeadless: () => {}, loadText: async () => initial,
    send: (to, m) => wire.up.has(to) && wire.queue.push(() => guests[to].doc.handle(m)),
  });
  const addGuest = (id) => {
    wire.up.add(id);
    const g = { id, doc: null };
    g.doc = new DocGuest({ lib, peer, myId: () => id, editorFor: () => null, send: (m) => wire.up.has(id) && wire.queue.push(() => host.handle(id, m)) });
    guests[id] = g;
    return g;
  };
  return { wire, host, guests, addGuest };
}
const edit = (target, path, text, spec) => {
  const cs = ChangeSet.of(spec, text.length);
  target(path, cs);
};

test("guest opens a file lazily and converges with host edits", async () => {
  const { wire, host, addGuest } = setup();
  const g = addGuest("g1");
  const p = g.doc.open("/a.php");
  await wire.pump();
  assert.equal(await p, "line one\nline two\n");
  host.local("/a.php", ChangeSet.of({ from: 0, insert: "// " }, 18));
  await wire.pump();
  assert.equal(g.doc.text("/a.php"), "// line one\nline two\n");
  g.doc.local("/a.php", ChangeSet.of({ from: 3, insert: "X" }, 21));
  await wire.pump();
  assert.equal(g.doc.text("/a.php"), host.entries.get("/a.php").text.toString());
});

test("edits made while offline are recovered after reconnect without duplicates", async () => {
  const { wire, host, addGuest } = setup("abc");
  const g = addGuest("g1");
  const p = g.doc.open("/f"); await wire.pump(); await p;
  // network drops: guest keeps typing, host keeps typing
  wire.up.delete("g1");
  g.doc.local("/f", ChangeSet.of({ from: 3, insert: "!" }, 3));      // sent into the void
  host.local("/f", ChangeSet.of({ from: 0, insert: ">" }, 3));
  await wire.pump();
  assert.equal(host.entries.get("/f").text.toString(), ">abc");
  // reconnect: guest asks what it missed, then re-sends its in-flight edit
  wire.up.add("g1");
  g.doc.catchUpAll();
  await wire.pump();
  assert.equal(host.entries.get("/f").text.toString(), g.doc.text("/f"));
  assert.equal(g.doc.text("/f"), ">abc!");
});

test("an edit that reached the host but whose ack was lost is not applied twice", async () => {
  const { wire, host, addGuest, guests } = setup("abc");
  const g = addGuest("g1");
  const p = g.doc.open("/f"); await wire.pump(); await p;
  g.doc.local("/f", ChangeSet.of({ from: 3, insert: "!" }, 3));
  // deliver the guest's ops to the host, but drop the host's reply
  const realUp = new Set(wire.up);
  await wire.queue.shift()();            // host applies it
  wire.queue.length = 0;                 // ack lost
  g.doc.catchUpAll();
  await wire.pump();
  assert.equal(host.entries.get("/f").text.toString(), "abc!");
  assert.equal(g.doc.text("/f"), "abc!");
  void realUp; void guests;
});

test("random soak over two guests and the host, with a reconnect in the middle", async () => {
  let seed = 11;
  const rnd = (n) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
  const { wire, host, addGuest } = setup("0123456789");
  const gs = [addGuest("g1"), addGuest("g2")];
  for (const g of gs) { const p = g.doc.open("/f"); await wire.pump(); await p; }
  for (let i = 0; i < 300; i++) {
    const who = rnd(3);
    const cur = who === 2 ? host.entries.get("/f").text : gs[who].doc.entries.get("/f").text;
    const from = rnd(cur.length + 1);
    const spec = { from, insert: String.fromCharCode(97 + rnd(26)) };
    const cs = ChangeSet.of(spec, cur.length);
    if (who === 2) host.local("/f", cs); else gs[who].doc.local("/f", cs);
    if (i === 120) wire.up.delete("g2");
    if (i === 180) { wire.up.add("g2"); gs[1].doc.catchUpAll(); }
    if (rnd(4) === 0) await wire.pump();
  }
  wire.up.add("g2");
  await wire.pump();
  gs[1].doc.catchUpAll(); gs[0].doc.catchUpAll();
  await wire.pump();
  const truth = host.entries.get("/f").text.toString();
  for (const g of gs) assert.equal(g.doc.text("/f"), truth);
});

test("rpc: chunked results, binary values, permissions and timeouts", async () => {
  const engine = {
    fs: { list: async () => Array.from({ length: 4000 }, (_, i) => ({ path: `/f${i}.php`, size: i })), write: async () => "ok", read: async () => ({ text: "x" }) },
    db: { query: async () => [{ rows: [[1n, new Uint8Array([1, 2, 3])]] }] },
  };
  let canWrite = false;
  let guest;
  const host = new RpcHost({ engine, canWrite: () => canWrite, send: (_to, m) => queueMicrotask(() => guest.handle(m)) });
  guest = new RpcGuest({ send: (m) => queueMicrotask(() => host.handle("g1", m)), timeoutMs: 200 });
  const list = await guest.call("fs.list");
  assert.equal(list.length, 4000);
  const [q] = await guest.call("db.query", ["select 1", "x"]);
  assert.equal(q.rows[0][0], 1n);
  assert.deepEqual([...q.rows[0][1]], [1, 2, 3]);
  await assert.rejects(guest.call("fs.write", ["/a", "b"]), /n’autorise pas/);
  canWrite = true;
  assert.equal(await guest.call("fs.write", ["/a", "b"]), "ok");
  await assert.rejects(guest.call("process.exit"), /non autorisée/);
  const silent = new RpcGuest({ send: () => {}, timeoutMs: 50 });
  await assert.rejects(silent.call("fs.list"), /ne répond pas/);
  assert.equal(decode(encode({ a: 1n })).a, 1n);
});

test("guest engine proxy replaces and restores methods", async () => {
  const engine = { fs: { list: async () => "local" }, db: { get ready() { return false; }, init: async () => "local-init" } };
  const rpc = { call: async (m) => "remote:" + m };
  const restore = installGuestEngine(engine, rpc);
  assert.equal(await engine.fs.list(), "remote:fs.list");
  assert.equal(engine.db.ready, true);
  restore();
  assert.equal(await engine.fs.list(), "local");
  assert.equal(engine.db.ready, false);
});
