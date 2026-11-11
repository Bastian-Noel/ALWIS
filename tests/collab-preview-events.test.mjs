import { test } from "node:test";
import assert from "node:assert/strict";
import { FocusLayer } from "../apps/studio/collab/focus.mjs";

class PassiveObserver { observe() {} disconnect() {} }

function fixture({ mirrored = false, interactive = false } = {}) {
  const previous = { document: globalThis.document, MutationObserver: globalThis.MutationObserver };
  const doc = new EventTarget();
  doc.querySelectorAll = () => [];
  doc.querySelector = () => null;
  const frame = new EventTarget();
  frame.contentDocument = new EventTarget();
  frame.contentDocument.querySelectorAll = () => [];
  frame.getBoundingClientRect = () => ({ left: 100, top: 100, right: 500, bottom: 350, width: 400, height: 250 });
  const previewBox = { getBoundingClientRect: () => ({ left: 100, top: 100, right: 500, bottom: 350, width: 400, height: 250 }) };
  doc.body = new EventTarget();
  doc.querySelector = selector => selector === "#pvFrames" ? previewBox : null;
  doc.querySelectorAll = selector => selector === "#pvFrames iframe" ? [frame] : [];
  globalThis.document = doc;
  globalThis.MutationObserver = PassiveObserver;
  const events = [];
  const layer = new FocusLayer({
    send: () => {}, peer: () => ({}), getCtx: () => ({ view: "code" }),
    previewInteractive: () => interactive,
    onPreview: mirrored ? event => events.push(event) : undefined,
  });
  layer.start();
  const click = () => {
    const event = new Event("click", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "target", { value: {
      closest: selector => selector === "a, form" ? { href: "/index.php" } : null,
      getAttribute: () => null, tagName: "A",
    } });
    Object.defineProperties(event, { clientX: { value: 25 }, clientY: { value: 25 }, button: { value: 0 } });
    frame.contentDocument.dispatchEvent(event);
    return event;
  };
  return {
    click, events,
    close: () => {
      layer.stop();
      globalThis.document = previous.document;
      globalThis.MutationObserver = previous.MutationObserver;
    },
  };
}

test("DOM mirror still blocks navigation and replays its click to the host", () => {
  const f = fixture({ mirrored: true });
  try {
    assert.equal(f.click().defaultPrevented, true);
    assert.equal(f.events[0].kind, "click");
  } finally { f.close(); }
});

test("native HTTP guest preview never blocks links or replays clicks", () => {
  const f = fixture({ mirrored: true, interactive: true });
  try {
    assert.equal(f.click().defaultPrevented, false);
    assert.equal(f.events.length, 0);
  } finally { f.close(); }
});

test("host preview never blocks links when collaboration presence is active", () => {
  const f = fixture();
  try { assert.equal(f.click().defaultPrevented, false); }
  finally { f.close(); }
});
