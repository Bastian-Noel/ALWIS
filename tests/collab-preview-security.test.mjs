import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { guestPreviewSandbox, isSafeGuestSandbox } from '../apps/studio/collab/preview-security.mjs';

test('real guest PHP/JS preview gets an opaque sandbox origin, with no parent navigation', () => {
  assert.equal(guestPreviewSandbox(true), 'allow-scripts allow-forms');
  assert.equal(isSafeGuestSandbox(guestPreviewSandbox(true)), true);
  assert.equal(isSafeGuestSandbox('allow-scripts allow-forms allow-same-origin'), false);
  const isolated = { previewOrigin: "https://guest.example", studioOrigin: "https://studio.example" };
  assert.equal(guestPreviewSandbox(true, isolated), "allow-scripts allow-forms allow-same-origin");
  assert.equal(isSafeGuestSandbox(guestPreviewSandbox(true, isolated), isolated), true);
  // Sibling subdomains share Domain=.example.fr cookies; never grant a
  // scriptable same-origin sandbox to attacker-controlled preview pages there.
  const sibling = { previewOrigin: "https://preview.example.fr", studioOrigin: "https://studio.example.fr" };
  assert.equal(guestPreviewSandbox(true, sibling), "allow-scripts allow-forms");
  assert.equal(isSafeGuestSandbox("allow-scripts allow-same-origin", sibling), false);
  assert.equal(isSafeGuestSandbox(guestPreviewSandbox(true, isolated), {
    previewOrigin: "https://studio.example", studioOrigin: "https://studio.example",
  }), false);
  assert.equal(isSafeGuestSandbox('allow-scripts allow-top-navigation'), false);
});

test('legacy read-only HTML snapshot stays script-free and isolated', () => {
  assert.equal(guestPreviewSandbox(false), 'allow-same-origin');
  assert.equal(isSafeGuestSandbox(guestPreviewSandbox(false)), true);
});

test('guest iframe sandbox is reapplied both at role change and every render', () => {
  const wiring = readFileSync(new URL('../apps/studio/collab/wire.mjs', import.meta.url), 'utf8');
  const view = readFileSync(new URL('../apps/studio/workbench/views/code.mjs', import.meta.url), 'utf8');
  assert.match(wiring, /setAttribute\("sandbox", guestPreviewSandbox\(interactivePreview,/);
  assert.match(wiring, /toggleAttribute\("data-guest-http-preview", interactivePreview\)/);
  assert.match(view, /guestPreviewSandbox\(document\.documentElement\.hasAttribute\("data-guest-http-preview"\),/);
  assert.match(view, /setAttribute\("sandbox", sandbox\)/);
});


test("fallback is scoped to guests whose isolated-origin broker could not start", () => {
  const wiring = readFileSync(new URL("../apps/studio/collab/wire.mjs", import.meta.url), "utf8");
  const presence = readFileSync(new URL("../apps/studio/collab/presence-ui.mjs", import.meta.url), "utf8");
  assert.match(wiring, /new PreviewDelivery\(\)/);
  assert.match(wiring, /previewDelivery\.targets\(session\.links\.keys\(\), collab\.previewEnabled\)/);
  assert.match(wiring, /case "http-preview-status":/);
  assert.match(wiring, /send\(\{ t: "http-preview-status", usable: false \}\)/);
  assert.match(wiring, /previewDelivery\.drop\(id\)/);
  assert.match(presence, /disabled: !hasIsolatedPreview/);
});
