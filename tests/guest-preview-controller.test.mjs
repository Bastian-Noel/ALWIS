import { test } from "node:test";
import assert from "node:assert/strict";
import { GuestPreviewController } from "../apps/studio/collab/guest-preview-controller.mjs";
const token = "c".repeat(32);

const settle = () => new Promise(resolve => setImmediate(resolve));

test("guest HTTP Service Worker RPC returns binary response without DOM mirroring", async () => {
  const sent = [], calls = [];
  const bridge = new GuestPreviewController({ channel: token,
    request: async request => { calls.push(request); return { status: 201, headers: [["Content-Type", "application/octet-stream"]], body: new Uint8Array([0, 255, 23]) }; },
    cookie: async () => [], serviceWorker: {} });
  bridge.active = true;
  const route = { type: "pbl-guest-route", channel: token, request: { method: "POST", url: "https://studio.example/form.php", body: new Uint8Array([9, 0]) } };
  assert.equal(bridge.handle({ data: route, ports: [{ postMessage: (value, transfers) => sent.push({ value, transfers }) }] }), true);
  await settle();
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].body[1], 0);
  assert.equal(sent[0].value.ok, true);
  assert.deepEqual([...sent[0].value.value.body], [0, 255, 23]);
  assert.equal(sent[0].transfers.length, 1);
  assert.equal(bridge.url("/index.php"), `/__pbl-guest/${token}/index.php`);
});

test("offline guest refuses HTTP without sending side-effecting POST", async () => {
  let requests = 0, result;
  const bridge = new GuestPreviewController({ channel: token,
    request: async () => { requests++; }, cookie: async () => {}, online: () => false, serviceWorker: {} });
  bridge.active = true;
  assert.equal(bridge.handle({ data: { type: "pbl-guest-route", channel: token, request: { method: "POST" } },
    ports: [{ postMessage: value => { result = value; } }] }), true);
  await settle();
  assert.equal(requests, 0);
  assert.equal(result.ok, false);
  assert.match(result.error, /déconnecté/);
});

test("guest channel does not accept RPC for another browser capability", () => {
  const bridge = new GuestPreviewController({ channel: token, request: () => {}, cookie: () => {}, serviceWorker: {} });
  bridge.active = true;
  assert.equal(bridge.handle({ data: { type: "pbl-guest-route", channel: "f".repeat(32) }, ports: [] }), false);
});
