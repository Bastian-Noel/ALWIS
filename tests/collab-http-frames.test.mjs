import { test } from "node:test";
import assert from "node:assert/strict";
import { httpFrames, HttpFrameCollector } from "../apps/studio/collab/http-frames.mjs";

test("HTTP binary 150 KiB is preserved across bounded frames including zero bytes", () => {
  const body = Uint8Array.from({ length: 150 * 1024 }, (_, i) => i % 256);
  const frames = httpFrames("http-response", 3, { status: 200, headers: [["Content-Type", "image/png"]] }, body);
  assert.ok(frames.length > 20);
  assert.ok(frames.every(frame => JSON.stringify(frame).length < 12 * 1024));
  const collector = new HttpFrameCollector();
  let reply = null;
  for (const frame of [...frames].reverse()) reply = collector.accept("guest-a", frame) ?? reply;
  assert.equal(reply.meta.status, 200);
  assert.deepEqual([...reply.body], [...body]);
  assert.equal(collector.pending.size, 0);
});

test("HTTP framing refuses impossible indices and unbounded payloads", () => {
  const collector = new HttpFrameCollector({ maxPending: 1 });
  assert.throws(() => collector.accept("a", { t: "http-request", id: 1, part: 0, parts: 999999, d: "" }));
  assert.throws(() => collector.accept("a", { t: "http-request", id: 1, part: 4, parts: 2, d: "" }));
  const frames = httpFrames("http-request", 1, { method: "GET" }, new Uint8Array(7 * 1024));
  collector.accept("a", frames[0]);
  assert.throws(() => collector.accept("a", frames[0]), /Duplicate/);
  collector.reset();
});

test("HTTP transports distinct guest identities without merging their frames", () => {
  const a = httpFrames("http-request", 1, { method: "GET", url: "/a" }, new Uint8Array([1]));
  const b = httpFrames("http-request", 1, { method: "GET", url: "/b" }, new Uint8Array([2]));
  const collector = new HttpFrameCollector();
  const ra = collector.accept("A", a[0]);
  const rb = collector.accept("B", b[0]);
  assert.equal(ra.meta.url, "/a");
  assert.equal(rb.meta.url, "/b");
  assert.deepEqual([...ra.body], [1]);
  assert.deepEqual([...rb.body], [2]);
});
