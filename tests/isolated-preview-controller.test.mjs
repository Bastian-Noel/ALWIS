import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePreviewOrigin, guestPreviewHostRequest, IsolatedGuestPreviewController } from "../apps/studio/collab/isolated-preview-controller.mjs";

const config = Object.freeze({
  studioOrigin: "https://studio.example",
  previewOrigin: "https://guest.example",
  channel: "a".repeat(32),
});

test("isolated preview origin must differ from studio and use HTTPS", () => {
  assert.equal(validatePreviewOrigin("https://guest.example", config.studioOrigin), config.previewOrigin);
  assert.throws(() => validatePreviewOrigin("https://preview.example.fr", "https://studio.example.fr"),
    /site dédié|domaine de cookies/);
  assert.equal(validatePreviewOrigin("https://preview-other-domain.net", "https://studio.example.fr"),
    "https://preview-other-domain.net");
  for (const value of ["https://studio.example", "http://guest.example", "https://guest.example/path",
    "https://guest.example?mode=unsafe", "javascript:alert(1)"])
    assert.throws(() => validatePreviewOrigin(value, config.studioOrigin));
});

test("all guest requests are normalized to trusted studio before host RPC", () => {
  const absolute = guestPreviewHostRequest({ url: config.previewOrigin + "/__alwis-guest/" + config.channel + "/post.php?step=2", method: "POST" }, config);
  assert.equal(absolute.url, "https://studio.example/post.php?step=2");
  const relative = guestPreviewHostRequest({ url: "https://guest.example/data.php" }, config);
  assert.equal(relative.url, "https://studio.example/data.php");
  assert.throws(() => guestPreviewHostRequest({ url: "https://studio.example/admin/server" }, config));
  assert.throws(() => guestPreviewHostRequest({ url: "https://guest.example/__alwis-guest/" + "b".repeat(32) + "/index.php" }, config));
});

test("broker authentication requires exact WindowProxy, channel and origin", async () => {
  const listeners = new Map(), window = { addEventListener(key, handler) { listeners.set(key,handler); },
    removeEventListener(key) { listeners.delete(key); } };
  const brokerWindow = {}, sent = [];
  const document = { createElement() { return {
    contentWindow: brokerWindow,
    setAttribute() {}, remove() { this.removed=true; },
  }; }, body: { append() {} } };
  const bridge = new IsolatedGuestPreviewController({
    origin: config.previewOrigin, studioOrigin: config.studioOrigin, channel: config.channel, window, document,
    request: async input => ({ status: 200, headers: [], body: new TextEncoder().encode(input.url) }),
    cookie: async () => [], online: () => true,
  });
  const wait = bridge.start();
  const signal = data => ({ data, origin: config.previewOrigin, source: brokerWindow, ports: [{ postMessage(msg) { sent.push(msg); } }] });
  assert.equal(bridge.receive({ ...signal({ type: "alwis-preview-ready", channel: config.channel }), source: {} }),false);
  assert.equal(bridge.receive({ ...signal({ type: "alwis-preview-ready", channel: config.channel }), origin: config.studioOrigin }),false);
  assert.equal(bridge.receive(signal({ type: "alwis-preview-ready", channel: config.channel })), true);
  await wait;
  bridge.receive(signal({ type: "alwis-preview-http", channel: config.channel, request: { url: config.previewOrigin + "/data.php", method: "GET" } }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent[0].ok, true);
  assert.equal(new TextDecoder().decode(sent[0].response.body), config.studioOrigin + "/data.php");
  bridge.stop();
  assert.equal(listeners.has("message"),false);
});
