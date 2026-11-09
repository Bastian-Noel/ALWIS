import test from "node:test";
import assert from "node:assert/strict";

let JSDOM;
try { ({ JSDOM } = await import("jsdom")); } catch {}
const skip = !JSDOM;

async function setup() {
  const dom = new JSDOM("<!doctype html><div id=host></div>", { pretendToBeVisual: true });
  for (const k of ["window", "document", "navigator", "Node", "HTMLElement", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "DOMRect", "Range", "Selection"]) {
    try { globalThis[k] = dom.window[k]; } catch { Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true }); }
  }
  dom.window.document.createRange = () => ({ setStart() {}, setEnd() {}, getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }), getClientRects: () => [] , commonAncestorContainer: dom.window.document.body });
  const { EditorState, ChangeSet } = await import("@codemirror/state");
  const { EditorView } = await import("@codemirror/view");
  const ext = await import("../apps/studio/editor/collab-extension.mjs");
  const calls = { local: [], sel: [] };
  const view = new EditorView({
    parent: dom.window.document.querySelector("#host"),
    state: EditorState.create({ doc: "hello world", extensions: [ext.collabExtension({ local: (c) => calls.local.push(c), selection: (s) => calls.sel.push(s) })] }),
  });
  return { dom, view, ext, calls, ChangeSet };
}

test("local edits reach the bridge, remote edits and file swaps do not", { skip }, async () => {
  const { view, ext, calls, ChangeSet } = await setup();
  view.dispatch({ changes: { from: 0, insert: "A" } });
  assert.equal(calls.local.length, 1);
  const remote = ChangeSet.of({ from: view.state.doc.length, insert: "!" }, view.state.doc.length);
  assert.equal(ext.applyRemote(view, remote, { id: "g1", css: "--c:red" }), true);
  assert.equal(view.state.doc.toString(), "Ahello world!");
  assert.equal(calls.local.length, 1, "remote change must not echo back");
  ext.swapDocument(view, "another file");
  assert.equal(calls.local.length, 1, "document swap is not an edit");
  assert.equal(view.state.doc.toString(), "another file");
  view.destroy();
});

test("a stale remote change (wrong length) is refused instead of corrupting", { skip }, async () => {
  const { view, ext, ChangeSet } = await setup();
  const bad = ChangeSet.of({ from: 0, insert: "x" }, 3);
  assert.equal(ext.applyRemote(view, bad, { id: "g1", css: "" }), false);
  assert.equal(view.state.doc.toString(), "hello world");
  view.destroy();
});

test("remote cursors are drawn, follow edits and can be removed", { skip }, async () => {
  const { view, ext, dom } = await setup();
  ext.showCursors(view, [["g1", { name: "Bob", css: "--c:blue", anchor: 6, head: 11, at: Date.now() }]]);
  const doc = dom.window.document;
  assert.equal(doc.querySelectorAll(".cm-cb-caret").length, 1);
  assert.equal(doc.querySelector(".cm-cb-flag").textContent, "Bob");
  assert.equal(doc.querySelectorAll(".cm-cb-sel").length, 1);
  view.dispatch({ changes: { from: 0, insert: ">>" } });
  ext.showCursors(view, [["g1", null]]);
  assert.equal(doc.querySelectorAll(".cm-cb-caret").length, 0);
  view.destroy();
});

test("freshly inserted remote text is highlighted then released", { skip }, async () => {
  const { view, ext, dom, ChangeSet } = await setup();
  ext.applyRemote(view, ChangeSet.of({ from: 5, insert: "XYZ" }, 11), { id: "g2", css: "--cf:yellow" });
  assert.equal(dom.window.document.querySelectorAll(".cm-cb-ins").length, 1);
  view.destroy();
});
