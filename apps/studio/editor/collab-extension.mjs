// CodeMirror side of multi-user editing: remote carets, selections and a short-lived
// background on freshly typed remote text. Pure editor code, no network knowledge.
import { Annotation, StateEffect, StateField, RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";

export const remoteChange = Annotation.define(); // applied from a peer: never re-sent
export const programmatic = Annotation.define(); // whole-document swap (file switch): never an edit

const FLASH_MS = 4000;
const MAX_FLASHES = 300;
export const setCursors = StateEffect.define(); // Map<peerId, {name,css,anchor,head,seq}>
const addFlash = StateEffect.define(); // {from,to,css,key}
const dropFlash = StateEffect.define(); // key

function style(css) { return css; }

class Caret extends WidgetType {
  constructor(name, css, recent) { super(); this.name = name; this.css = css; this.recent = recent; }
  eq(o) { return o.name === this.name && o.css === this.css && o.recent === this.recent; }
  toDOM() {
    const caret = document.createElement("span");
    caret.className = "cm-cb-caret" + (this.recent ? " recent" : "");
    caret.style.cssText = style(this.css);
    const flag = document.createElement("span");
    flag.className = "cm-cb-flag";
    flag.textContent = this.name;
    caret.append(flag);
    caret.setAttribute("aria-hidden", "true");
    return caret;
  }
  ignoreEvent() { return true; }
}

const cursorField = StateField.define({
  create: () => new Map(),
  update(map, tr) {
    let next = map;
    if (tr.docChanged) {
      next = new Map();
      for (const [id, c] of map) next.set(id, { ...c, anchor: tr.changes.mapPos(c.anchor, 1), head: tr.changes.mapPos(c.head, 1) });
    }
    for (const e of tr.effects) if (e.is(setCursors)) {
      next = next === map ? new Map(next) : next;
      for (const [id, c] of e.value) {
        if (c === null) next.delete(id);
        else next.set(id, c);
      }
    }
    return next;
  },
});

const flashField = StateField.define({
  create: () => ({ set: Decoration.none, keys: [] }),
  update(value, tr) {
    let { set, keys } = value;
    if (tr.docChanged) set = set.map(tr.changes);
    const add = [];
    for (const e of tr.effects) {
      if (e.is(addFlash)) add.push(e.value);
      if (e.is(dropFlash)) {
        keys = keys.filter((k) => k !== e.value);
        set = set.update({ filter: (_f, _t, d) => d.spec.key !== e.value });
      }
    }
    if (add.length) {
      set = set.update({ add: add.filter((a) => a.to > a.from).map((a) => Decoration.mark({ class: "cm-cb-ins", attributes: { style: a.css }, key: a.key }).range(a.from, a.to)), sort: true });
      keys = [...keys, ...add.map((a) => a.key)].slice(-MAX_FLASHES);
    }
    return { set, keys };
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.set),
});

const cursorDecorations = EditorView.decorations.compute([cursorField], (state) => {
  const map = state.field(cursorField);
  const b = [];
  const docLen = state.doc.length;
  for (const c of map.values()) {
    const anchor = Math.min(docLen, Math.max(0, c.anchor)), head = Math.min(docLen, Math.max(0, c.head));
    if (anchor !== head) b.push(Decoration.mark({ class: "cm-cb-sel", attributes: { style: c.css } }).range(Math.min(anchor, head), Math.max(anchor, head)));
    b.push(Decoration.widget({ widget: new Caret(c.name, c.css, Date.now() - (c.at ?? 0) < 2500), side: 1 }).range(head));
  }
  return Decoration.set(b, true);
});

/**
 * @param {{ local(changes, tr): void, selection(sel): void }} bridge
 */
export function collabExtension(bridge) {
  return [
    cursorField,
    flashField,
    cursorDecorations,
    EditorView.updateListener.of((update) => {
      const programmaticSwap = update.transactions.some((t) => t.annotation(programmatic));
      if (update.docChanged && !programmaticSwap) {
        for (const tr of update.transactions) {
          if (tr.docChanged && !tr.annotation(remoteChange)) bridge.local(tr.changes, tr);
        }
      }
      if ((update.selectionSet || update.docChanged) && !programmaticSwap) {
        const hasLocal = update.transactions.some((t) => !t.annotation(remoteChange));
        if (hasLocal) bridge.selection(update.state.selection.main);
      }
    }),
  ];
}

/** Apply a peer's ChangeSet. The inserted text is highlighted for a few seconds. */
export function applyRemote(view, changes, peer) {
  if (changes.length !== view.state.doc.length) return false; // desync: caller resyncs
  const flashes = [];
  const seq = ++applyRemote.n;
  changes.iterChanges((_fa, _ta, fromB, toB) => {
    if (toB > fromB) flashes.push(addFlash.of({ from: fromB, to: toB, css: peer.css, key: `${peer.id}:${seq}:${fromB}` }));
  });
  view.dispatch({ changes, annotations: remoteChange.of(true), effects: flashes, filter: false });
  const keys = flashes.map((f) => f.value.key);
  if (keys.length) setTimeout(() => { try { view.dispatch({ effects: keys.map((k) => dropFlash.of(k)), annotations: remoteChange.of(true) }); } catch {} }, FLASH_MS + 200);
  return true;
}
applyRemote.n = 0;

/** Replace the whole document without it being treated as an edit. */
export function swapDocument(view, text) {
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, annotations: [programmatic.of(true), remoteChange.of(true)], filter: false });
}

export function showCursors(view, entries) {
  view.dispatch({ effects: setCursors.of(new Map(entries)), annotations: remoteChange.of(true) });
}
