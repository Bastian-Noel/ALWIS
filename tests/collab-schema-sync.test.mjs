import test from "node:test";
import assert from "node:assert/strict";
import { SchemaSync } from "../apps/studio/collab/schema-sync.mjs";

test("host orders moves across databases, fans out negative positions and restores a late guest", () => {
  const layouts = {}, outbound = [], a = [], b = [];
  const host = new SchemaSync({ host: true, layouts: () => layouts, send: m => outbound.push(m),
    apply: m => (layouts[m.db] ??= {})[m.table] = m.pos });
  const guest = new SchemaSync({ send: m => host.receive(m), apply: m => a.push(m) });
  guest.move("school", "users", [-240, -160], true);
  assert.deepEqual(layouts.school.users, [-240, -160]);
  host.move("other", "users", [800, -16], true);
  const late = new SchemaSync({ apply: m => b.push(m) });
  host.snapshot(m => late.receive(m));
  assert.equal(b.length, 2);
  assert.deepEqual(b[0].pos, [-240, -160]);
  assert.equal(guest.receive(outbound[0]), true);
  assert.equal(guest.receive(outbound[0]), false, "duplicate state ignored");
  host.move("school", "users", [-320, -200], true);
  assert.equal(guest.receive(outbound.at(-1)), true);
  assert.equal(guest.receive(outbound[0]), false, "old arrival cannot revert a newer placement");
  assert.deepEqual(a.at(-1).pos, [-320, -200]);
  for (const s of [host,guest,late]) s.stop();
});

test("coalescing retains the final position and disconnect cancels pending movement", async () => {
  const sent = [];
  const s = new SchemaSync({ send: m => sent.push(m) });
  s.move("test", "t", [1, 2]); s.move("test", "t", [-8, -16]);
  s.move("test", "t", [-24, -32], true);
  assert.equal(sent.length, 1); assert.deepEqual(sent[0].pos, [-24, -32]);
  s.move("test", "t", [9, 9]); s.stop();
  await new Promise(r => setTimeout(r, 60));
  assert.equal(sent.length, 1);
});

test("reject malformed coordinates and host state forged by a guest", () => {
  let applies = 0;
  const host = new SchemaSync({ host: true, send() {}, apply() { applies++; } });
  for (const pos of [[NaN,0],[0,Infinity],[0],[1e12,0],["1",2]])
    assert.equal(host.receive({ t: "schema-move", db: "test", table: "t", pos }), false);
  assert.equal(host.receive({ t: "schema-placement", db: "test", table: "t", pos: [0,0], revision: 9 }), false);
  assert.equal(applies, 0); host.stop();
});
