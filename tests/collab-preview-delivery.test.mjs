import { test } from "node:test";
import assert from "node:assert/strict";
import { PreviewDelivery } from "../apps/studio/collab/preview-delivery.mjs";

test("working isolated HTTP previews receive no unnecessary DOM mirrors", () => {
  const delivery = new PreviewDelivery();
  delivery.update("alice", { enabled: true, usable: true });
  delivery.update("bob", { enabled: true, usable: true });
  assert.deepEqual(delivery.targets(["alice", "bob"], true), []);
  assert.deepEqual(delivery.targets(["alice", "bob"], false), ["alice", "bob"]);
});
test("one guest falling back does not disable another guest's interactive preview", () => {
  const delivery = new PreviewDelivery();
  assert.equal(delivery.update("alice", { enabled: true, usable: false }), true);
  delivery.update("bob", { enabled: true, usable: true });
  assert.deepEqual(delivery.targets(["alice", "bob", "eve"], true), ["alice"]);
  delivery.update("alice", { enabled: true, usable: true });
  assert.deepEqual(delivery.targets(["alice", "bob"], true), []);
});
test("disconnection and permission revocation remove fallback state", () => {
  const delivery = new PreviewDelivery();
  delivery.update("alice", { enabled: true, usable: false });
  delivery.update("bob", { enabled: true, usable: false });
  delivery.drop("alice");
  assert.deepEqual(delivery.targets(["alice", "bob"], true), ["bob"]);
  delivery.reset();
  assert.deepEqual(delivery.targets(["alice", "bob"], true), []);
  assert.deepEqual(delivery.targets(["alice", "bob"], false), ["alice", "bob"]);
});
test("guest cannot re-enable a host-disabled preview", () => {
  const delivery = new PreviewDelivery();
  assert.equal(delivery.update("eve", { enabled: false, usable: false }), false);
  assert.deepEqual(delivery.targets(["eve"], true), []);
});
