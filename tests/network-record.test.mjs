import test from "node:test";
import assert from "node:assert/strict";
import { inspectBody, networkRecord } from "../apps/studio/network-record.mjs";
const encode = (text) => new TextEncoder().encode(text);
test("network inspection bounds text and keeps binary bodies out of the UI", () => {
  const text = inspectBody(encode("x".repeat(40000)), [
    ["Content-Type", "text/plain"],
  ]);
  assert.equal(text.text.length, 32768);
  assert.equal(text.bytes, 40000);
  assert.equal(text.truncated, true);
  assert.equal(
    inspectBody(new Uint8Array([1, 2, 3]), [["Content-Type", "image/png"]])
      .text,
    null,
  );
});
test("network record preserves query, POST body, headers and original response before bootstrap", () => {
  const response = {
    status: 201,
    headers: [["Content-Type", "text/html"]],
    body: encode("injected"),
    inspection: inspectBody(encode("<b>ok</b>"), [
      ["Content-Type", "text/html"],
    ]),
  };
  const r = networkRecord(
    "A",
    {
      url: "https://test.local/api.php?q=1",
      method: "POST",
      headers: [["Content-Type", "application/x-www-form-urlencoded"]],
      body: encode("name=Alice"),
    },
    response,
    12,
  );
  assert.equal(r.name, "api.php");
  assert.equal(r.path, "/api.php?q=1");
  assert.equal(r.requestBody.text, "name=Alice");
  assert.equal(r.responseBody.text, "<b>ok</b>");
  assert.equal(r.status, 201);
});
