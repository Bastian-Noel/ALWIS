import { test } from "node:test";
import assert from "node:assert/strict";
import { validGuestChannel, guestPreviewURL, parseGuestPreviewURL, guestPreviewLocation } from "../apps/studio/collab/guest-preview-route.mjs";
const channel = "a".repeat(32);

test("guest URL namespace carries only a random channel, not host project or session", () => {
  const url = guestPreviewURL(channel, "/profile.php?visitor=1");
  assert.equal(url, `/__pbl-guest/${channel}/profile.php?visitor=1`);
  assert.deepEqual(parseGuestPreviewURL(`https://studio.example${url}`), { channel, path: "/profile.php?visitor=1" });
  assert.equal(parseGuestPreviewURL(`/__pbl-guest/${channel}/` )?.path, "/");
  assert.equal(parseGuestPreviewURL(`/__pbl-guest/unknown/index.php`), null);
  assert.equal(validGuestChannel("not-a-capability"), false);
});

test("rejects protocol-relative and foreign guest preview paths", () => {
  assert.throws(() => guestPreviewURL(channel, "//evil.example/"), /Invalid/);
  assert.throws(() => guestPreviewURL(channel, "https://evil.example/"), /Invalid/);
  assert.throws(() => guestPreviewURL("bad", "/index.php"), /Invalid/);
});

test("host session redirects become guest-local without rewriting external redirects", () => {
  assert.equal(guestPreviewLocation("/__pbl/project123/session456/login.php?step=2", channel, "https://studio.example"),
    `/__pbl-guest/${channel}/login.php?step=2`);
  assert.equal(guestPreviewLocation("https://outside.example/path", channel, "https://studio.example"), "https://outside.example/path");
  assert.equal(guestPreviewLocation("/already-local", channel, "https://studio.example"), "/already-local");
});
