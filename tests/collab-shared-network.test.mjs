import test from "node:test";
import assert from "node:assert/strict";
import { shareNetworkRecord, networkRecordReceiver } from "../apps/studio/collab/shared-network.mjs";

test("request inspection survives chunking and duplicates without revealing session headers", () => {
  const messages = [], records = [];
  const record = { id: "request-1", path: "/index.php", status: 200,
    requestHeaders: [["Cookie", "PHPSESSID=secret"], ["Accept", "text/html"]],
    responseHeaders: [["Set-Cookie", "secret"], ["Content-Type", "text/html"]],
    responseBody: { text: "a".repeat(32000) } };
  shareNetworkRecord(record, message => messages.push(message));
  assert.ok(messages.length > 1);
  const receive = networkRecordReceiver(record => records.push(record));
  receive(messages[0]); receive(messages[0]);
  assert.equal(records.length, 0);
  for (const message of messages.slice(1).reverse()) receive(message);
  assert.equal(records.length, 1);
  assert.equal(records[0].responseBody.text.length, 32000);
  assert.deepEqual(records[0].requestHeaders, [["Accept", "text/html"]]);
  assert.deepEqual(records[0].responseHeaders, [["Content-Type", "text/html"]]);
});

test("malformed or oversized records cannot allocate unbounded reassembly", () => {
  const receive = networkRecordReceiver(() => assert.fail("invalid record accepted"));
  for (const message of [{ parts: 999999 }, { id: "a", part: -1, parts: 1, d: "{}" },
    { id: "a", part: 0, parts: 1, d: "x".repeat(13000) }, { id: "a", part: 0, parts: 1, d: "{}" }])
    assert.equal(receive(message), false);
});
