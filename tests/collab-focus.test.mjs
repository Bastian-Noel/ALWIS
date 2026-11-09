import test from "node:test";
import assert from "node:assert/strict";

let JSDOM;
try { ({ JSDOM } = await import("jsdom")); } catch {}
const skip = !JSDOM;

async function page() {
  const dom = new JSDOM(`<!doctype html><main id="main"><table><tr><td data-r="0" data-c="1">a</td></tr><tr data-col="email"><td>x</td></tr><tr class="ghost"><td></td><td><input data-g="name"></td></tr></table></main>
  <div id="tree"><div class="row file" data-path="/index.php" data-kind="file"><span>index.php</span><span class="acts"></span></div></div><div id="pvFrames"></div>`, { pretendToBeVisual: true });
  for (const k of ["window", "document", "MutationObserver", "requestAnimationFrame", "getComputedStyle", "CSS"]) {
    try { globalThis[k] = dom.window[k]; } catch { Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true }); }
  }
  const { FocusLayer } = await import("../apps/studio/collab/focus.mjs");
  const peers = { g1: { id: "g1", name: "Bob", variant: 0, state: "online" }, g2: { id: "g2", name: "Léa", variant: 0, state: "away" } };
  const sent = [];
  const layer = new FocusLayer({ send: (m) => sent.push(m), peer: (id) => peers[id], getCtx: () => ({ view: "data", dmode: "data", table: "users", active: "/index.php" }) });
  const flush = () => new Promise((r) => dom.window.requestAnimationFrame(() => r()));
  return { dom, layer, sent, flush };
}

test("remote focus paints cell, structure row, ghost row and explorer badge", { skip }, async () => {
  const { dom, layer, flush } = await page();
  const d = dom.window.document;
  layer.receive("g1", { k: "view", view: "data", dmode: "data", table: "users", active: "/index.php" });
  layer.receive("g1", { k: "cell", table: "users", r: 0, c: 1 });
  await flush();
  assert.equal(d.querySelector('td[data-r="0"]').dataset.cbName, "Bob");
  assert.equal(d.querySelectorAll("#tree .cb-badges .cb-av").length, 0, "data view, not editing the file");
  layer.receive("g1", { k: "view", view: "code", active: "/index.php" });
  await flush();
  assert.equal(d.querySelector("#tree .cb-badges .cb-av").textContent, "B");
  layer.receive("g1", { k: "col", table: "users", name: "email" });
  layer.receive("g1", { k: "view", view: "data", dmode: "data", table: "users", active: "/index.php" });
  layer.receive("g1", { k: "ghost", table: "users", col: "name", values: { name: "Linus" } });
  await flush();
  assert.match(d.querySelector(".cb-ghostline").textContent, /Linus/);
  layer.drop("g1");
  await flush();
  assert.equal(d.querySelectorAll("[data-cb-focus], .cb-badges, .cb-ghostline").length, 0, "everything is cleaned up");
  layer.stop();
});

test("people who lost their connection are not painted; local focus is announced", { skip }, async () => {
  const { dom, layer, sent, flush } = await page();
  layer.receive("g2", { k: "cell", table: "users", r: 0, c: 1 });
  await flush();
  assert.equal(dom.window.document.querySelectorAll("[data-cb-focus]").length, 0);
  layer.start();
  dom.window.document.querySelector('td[data-r="0"]').dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true }));
  assert.equal(sent.at(-1).k, "cell");
  assert.equal(sent.at(-1).c, 1);
  layer.stop();
});
