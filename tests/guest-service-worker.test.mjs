import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { MessageChannel } from "node:worker_threads";
import { parseGuestPreviewURL, guestPreviewLocation, validGuestChannel } from "../apps/studio/collab/guest-preview-route.mjs";
const token = "d".repeat(32);
const origin = "https://studio.example";

function openWorker() {
  const data = new Map(), listeners = new Map(), clients = new Map(), requests = [];
  const store = {
    get: key => asyncResult(data.get(key)),
    put: (value, key) => { data.set(key, value); return asyncResult(undefined); },
    delete: key => { data.delete(key); return asyncResult(undefined); },
  };
  function asyncResult(value) {
    const request = { result: value };
    queueMicrotask(() => request.onsuccess?.());
    return request;
  }
  const db = { transaction: () => ({ objectStore: () => store }) };
  const indexedDB = { open: () => asyncResult(db) };
  const studio = { id: "studio", url: origin + "/", postMessage(message, ports) {
    requests.push(message);
    if (message.type === "pbl-guest-route") {
      const html = new TextEncoder().encode('<!doctype html><head><title>Home</title></head><body><script>window.visitor=1</script></body>');
      ports[0].postMessage({ ok: true, value: { status: 200, headers: [["Content-Type", "text/html"]],
        body: html, cookies: [{ name: "theme", value: "dark", path: "/", secure: false, expires: null }] } });
    } else if (message.type === "pbl-guest-cookie") ports[0].postMessage({ ok: true, value: [] });
  } };
  const preview = { id: "preview", url: origin + `/__pbl-guest/${token}/index.php`, messages: [], postMessage(v) { this.messages.push(v); } };
  clients.set("studio", studio); clients.set("preview", preview);
  const self = { location: { origin }, clients: { get: async id => clients.get(id), matchAll: async () => [...clients.values()] },
    addEventListener(type, handler) { listeners.set(type, handler); }, skipWaiting: async () => {}, };
  const source = readFileSync(new URL("../apps/studio/service-worker.mjs", import.meta.url), "utf8")
    .replace(/^import .*;\s*$/m, "");
  vm.runInNewContext(source, { self, indexedDB, MessageChannel, setTimeout, clearTimeout, URL,
    TextEncoder, TextDecoder, Headers, Request, Response, Uint8Array, Promise, fetch,
    parseGuestPreviewURL, guestPreviewLocation, validGuestChannel });
  async function bind() {
    let message;
    const event = { data: { type: "pbl-guest-bind", channel: token }, source: studio,
      ports: [{ postMessage(v) { message = v; } }], waitUntil(p) { this.done = p; } };
    listeners.get("message")(event); await event.done;
    assert.equal(message.ok, true);
  }
  async function route(path, { method = "GET", destination = "iframe", body = null, clientId = "studio", resultingClientId = "preview" } = {}) {
    const bytes = new TextEncoder().encode(body ?? "");
    const request = { url: origin + path, method, destination, headers: new Headers({ "Content-Type": "application/x-www-form-urlencoded" }),
      arrayBuffer: async () => bytes.buffer };
    const event = { request, clientId, resultingClientId, responds: null, respondWith(value) { this.responds = value; } };
    listeners.get("fetch")(event);
    return await event.responds;
  }
  return { bind, route, requests, data, preview, listeners, studio };
}

test("guest SW binds a local preview, forwards GET and injects only the guest-local PHP context", async () => {
  const sw = openWorker(); await sw.bind();
  const response = await sw.route(`/__pbl-guest/${token}/index.php`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /window\.__PBL_CONTEXT/);
  assert.match(html, new RegExp(`/__pbl-guest/${token}/`));
  assert.match(html, /window\.visitor=1/);
  assert.doesNotMatch(html, /\/__pbl\/project123\/session456/);
  assert.equal(sw.data.get("preview").guestChannel, token);
  assert.equal(sw.requests[0].request.url, origin + "/index.php");
});

test("guest SW keeps POST body for root-absolute form URLs and refuses unregistered capability", async () => {
  const sw = openWorker(); await sw.bind();
  await sw.route(`/__pbl-guest/${token}/index.php`);
  const res = await sw.route("/submit.php?step=1", { method: "POST", destination: "", body: "a=1%00b", clientId: "preview", resultingClientId: "" });
  assert.equal(res.status, 200);
  assert.equal(sw.requests[1].type, "pbl-guest-route");
  assert.equal(sw.requests[1].request.method, "POST");
  assert.deepEqual([...sw.requests[1].request.body], [...new TextEncoder().encode("a=1%00b")]);
  assert.equal(sw.requests[1].request.url, origin + "/submit.php?step=1");
  const unknown = await sw.route(`/__pbl-guest/${"e".repeat(32)}/index.php`);
  assert.equal(unknown.status, 503);
  assert.match(await unknown.text(), /studio invité/i);
});
