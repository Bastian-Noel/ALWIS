import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HTTP_LIMITS, normalizeGuestRequest, normalizeHostResponse,
  canReplayHTTP, GuestSessionRegistry,
} from "../apps/studio/collab/http-contract.mjs";

test("guest HTTP: preserves binary POST but strips forged cookies and auth", () => {
  const body = Uint8Array.of(0, 255, 1, 127);
  const request = normalizeGuestRequest({
    url: "/form.php?x=1", method: "POST", destination: "document", body,
    headers: [["Content-Type", "application/octet-stream"], ["Cookie", "PHPSESSID=spoof"],
      ["Authorization", "Bearer fake"], ["Connection", "close"]],
  }, "https://studio.mmi.place");
  assert.equal(request.url, "https://studio.mmi.place/form.php?x=1");
  assert.deepEqual([...request.body], [...body]);
  assert.deepEqual(request.headers, [["Content-Type", "application/octet-stream"]]);
  assert.equal(request.destination, "document");
});

test("guest HTTP: rejects malicious origins, invalid paths, oversized bodies and headers", () => {
  const base = "https://studio.mmi.place";
  for (const url of ["https://example.com/x", "javascript:alert(1)", "//evil.example/file", "/%2fetc/passwd", "/%00file"]) {
    assert.throws(() => normalizeGuestRequest({ url }, base));
  }
  assert.throws(() => normalizeGuestRequest({ url: "/", method: "TRACE" }, base));
  assert.throws(() => normalizeGuestRequest({ url: "/", body: [12] }, base));
  assert.throws(() => normalizeGuestRequest({ url: "/", method: "POST", body: new Uint8Array(HTTP_LIMITS.requestBytes + 1) }, base));
  assert.throws(() => normalizeGuestRequest({ url: "/", headers: [["X-Injected", "ok\r\nCookie: leak"]] }, base));
});

test("host HTTP: response body stays binary; forbidden transport headers removed", () => {
  const response = normalizeHostResponse({ status: 201, headers: [
    ["Content-Type", "application/octet-stream"], ["Set-Cookie", "PHPSESSID=secret"], ["Connection", "close"],
  ], body: Uint8Array.of(0, 255, 44) });
  assert.deepEqual([...response.body], [0, 255, 44]);
  assert.deepEqual(response.headers, [["Content-Type", "application/octet-stream"]]);
  assert.throws(() => normalizeHostResponse({ status: 204, body: [3] }));
  assert.throws(() => normalizeHostResponse({ status: 200, file: { name: "unsafe" } }));
});

test("HTTP reconnection never replays state-changing requests", () => {
  assert.equal(canReplayHTTP("GET"), true);
  assert.equal(canReplayHTTP("HEAD"), true);
  assert.equal(canReplayHTTP("POST"), false);
  assert.equal(canReplayHTTP("DELETE"), false);
});

test("guest session IDs are minted and removed by host, never accepted from the guest", async () => {
  const removed = []; let next = 0;
  const registry = new GuestSessionRegistry({
    create: async () => "host-session-" + ++next,
    remove: async id => removed.push(id),
  });
  const [a, b] = await Promise.all([registry.getOrCreate("peerA"), registry.getOrCreate("peerA")]);
  const c = await registry.getOrCreate("peerB");
  assert.equal(a, b);
  assert.notEqual(a, c);
  await registry.drop("peerA");
  await registry.close();
  assert.deepEqual(removed.sort(), [a, c].sort());
});
