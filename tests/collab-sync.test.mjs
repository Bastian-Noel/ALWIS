import test from "node:test";
import assert from "node:assert/strict";
import { ChangeSet, Text } from "@codemirror/state";
import { HostLog, GuestSync } from "../apps/studio/editor/collab-sync.mjs";

// Tiny in-memory harness: host doc + N guests, with explicit message delivery order.
function world(initial, guests) {
  const host = { doc: Text.of(initial.split("\n")), log: new HostLog() };
  const gs = guests.map((id) => ({ id, doc: host.doc, sync: new GuestSync(id), inbox: [] }));
  const out = []; // guest -> host messages
  const hostEdit = (spec) => {
    const cs = ChangeSet.of(spec, host.doc.length);
    host.doc = cs.apply(host.doc);
    broadcast(host.log.record(cs, "h"));
  };
  const broadcast = (u) => gs.forEach((g) => g.inbox.push(u));
  const guestEdit = (g, spec) => {
    const cs = ChangeSet.of(spec, g.doc.length);
    g.doc = cs.apply(g.doc);
    const m = g.sync.local(cs);
    if (m) out.push({ g, m });
  };
  const hostReceive = () => {
    const item = out.shift();
    const cs = host.log.rebase(item.m.version, item.m.changes, host.doc.length);
    assert.ok(cs, "rebase must succeed");
    host.doc = cs.apply(host.doc);
    broadcast(host.log.record(cs, item.g.id));
  };
  const guestReceive = (g) => {
    const u = g.inbox.shift();
    const r = g.sync.receive(u);
    assert.ok(!r.gap);
    if (r.apply) g.doc = r.apply.apply(g.doc);
    if (r.send) out.push({ g, m: r.send });
  };
  const settle = () => {
    for (let i = 0; i < 1000 && (out.length || gs.some((g) => g.inbox.length)); i++) {
      if (out.length) hostReceive();
      for (const g of gs) while (g.inbox.length) guestReceive(g);
    }
  };
  return { host, gs, hostEdit, guestEdit, settle, guestReceive };
}

test("concurrent edits converge", () => {
  const w = world("hello world", ["a", "b"]);
  w.guestEdit(w.gs[0], { from: 0, insert: "A:" });
  w.guestEdit(w.gs[1], { from: 11, insert: "!" });
  w.hostEdit({ from: 5, to: 6, insert: "_" });
  w.settle();
  const text = w.host.doc.toString();
  assert.equal(w.gs[0].doc.toString(), text);
  assert.equal(w.gs[1].doc.toString(), text);
  assert.equal(text, "A:hello_world!");
});

test("pending local edits survive remote updates and still converge", () => {
  const w = world("abc", ["a"]);
  w.guestEdit(w.gs[0], { from: 1, insert: "X" });
  w.guestEdit(w.gs[0], { from: 2, insert: "Y" }); // queued while first is in flight
  w.hostEdit({ from: 0, insert: ">>" });
  w.hostEdit({ from: 5, insert: "<<" });
  w.settle();
  assert.equal(w.gs[0].doc.toString(), w.host.doc.toString());
  assert.match(w.host.doc.toString(), /^>>a.*XY.*c<<$/);
});

test("randomised soak: 3 guests + host stay identical", () => {
  let seed = 7;
  const rnd = (n) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
  const w = world("0123456789", ["a", "b", "c"]);
  for (let step = 0; step < 400; step++) {
    const who = rnd(4);
    const doc = who === 3 ? w.host.doc : w.gs[who].doc;
    const from = rnd(doc.length + 1);
    const del = rnd(3) && doc.length - from > 0 ? Math.min(rnd(3), doc.length - from) : 0;
    const spec = { from, to: from + del, insert: rnd(2) ? String.fromCharCode(97 + rnd(26)) : "" };
    if (who === 3) w.hostEdit(spec);
    else w.guestEdit(w.gs[who], spec);
    if (rnd(3) === 0 && w.gs.some((g) => g.inbox.length)) {
      const g = w.gs[rnd(3)];
      if (g.inbox.length) w.guestReceive(g);
    }
    if (step % 17 === 0) w.settle();
  }
  w.settle();
  const text = w.host.doc.toString();
  for (const g of w.gs) assert.equal(g.doc.toString(), text);
});

test("stale or corrupt updates ask for a resync instead of corrupting", () => {
  const log = new HostLog();
  const doc = Text.of(["abc"]);
  assert.equal(log.rebase(5, [[3]], doc.length), null); // from the future
  assert.equal(log.rebase(0, [[7]], doc.length), null); // wrong length
  assert.equal(log.rebase(0, "garbage", doc.length), null);
});
