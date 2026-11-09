// Presence on the shared UI without touching the views: local focus is read from the DOM
// (events), remote focus is painted back as outlines, badges, ghost rows and pointers.
import { cssVars, initial } from "./colors.mjs";
import { createCoalescer } from "./protocol.mjs";

const SVGNS = "http://www.w3.org/2000/svg";
const esc = (v) => (globalThis.CSS?.escape ? CSS.escape(String(v)) : String(v).replace(/["\\]/g, "\\$&"));
const q = (sel, root = document) => root.querySelector(sel);
const qa = (sel, root = document) => [...root.querySelectorAll(sel)];

export class FocusLayer {
  /** getCtx(): { view, dmode, table, active } read from the workbench state. */
  constructor({ send, peer, getCtx, onClick, onPreview }) {
    Object.assign(this, { send, peer, getCtx, onClick, onPreview });
    this.remote = new Map(); // peerId -> { view, table, file, cell, col, ghost, mouse, rubber, at }
    this.marks = [];
    this.scheduled = false;
    this.mouse = createCoalescer((batch) => { for (const m of batch) this.send({ t: "focus", ...m }); }, 50);
    this.mo = new MutationObserver(() => this.schedule());
    this.frameMO = new MutationObserver(() => this.#bindFrames());
    this.listeners = [];
  }
  start() {
    const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); this.listeners.push(() => target.removeEventListener(type, fn, opts)); };
    const ctx = () => this.getCtx();
    on(document, "focusin", (e) => {
      const t = e.target;
      const cell = t.closest?.("td[data-r][data-c]");
      if (cell) return this.local("cell", { ...ctx(), r: +cell.dataset.r, c: +cell.dataset.c });
      const row = t.closest?.("tr[data-col]");
      if (row) return this.local("col", { ...ctx(), name: row.dataset.col });
      if (t.matches?.("input[data-g]")) return this.local("ghost", { ...ctx(), col: t.dataset.g, values: this.#ghostValues() ?? {} });
    });
    // Publish grid selection on click as well as keyboard focus; a cell may be
    // visually selected without receiving DOM focus in some browsers.
    on(document, "pointerdown", (e) => {
      const cell = e.target.closest?.("td[data-r][data-c]");
      if (cell) this.local("cell", { ...ctx(), r: +cell.dataset.r, c: +cell.dataset.c });
    });
    on(document, "input", (e) => {
      if (e.target.matches?.("input[data-g]")) this.local("ghost", { ...ctx(), col: e.target.dataset.g, values: this.#ghostValues() ?? {} }, true);
      const cell = e.target.closest?.("td[data-r][data-c]");
      if (cell && e.target.matches?.("input.ce")) this.local("cell", { ...ctx(), r: +cell.dataset.r, c: +cell.dataset.c, editing: true, value: e.target.value }, true);
    });
    on(document, "focusout", (e) => { if (e.target.matches?.("input[data-g]") && !this.#ghostValues(true)) this.local("ghost", { ...ctx(), values: null }); });
    on(document, "pointermove", (e) => this.#pointer(e, false), { passive: true });
    on(document, "pointerdown", (e) => this.#pointer(e, true), { passive: true });
    this.poll = setInterval(() => this.#poll(), 400);
    this.local("view", ctx());
    this.#bindFrames();
    this.frameMO.observe(q("#pvFrames") ?? document.body, { childList: true, subtree: true });
    const main = q("#main") ?? document.body;
    this.mo.observe(main, { childList: true, subtree: true });
    this.mo.observe(q("#tree") ?? main, { childList: true, subtree: true });
  }
  stop() {
    clearInterval(this.poll);
    this.mo.disconnect();
    this.frameMO.disconnect();
    this.listeners.splice(0).forEach((off) => off());
    this.mouse.clear();
    this.clearMarks();
    qa(".cb-mouse").forEach((n) => n.remove());
  }
  /* ---- local -> remote ---- */
  local(k, data, droppable = false) { this.send({ t: "focus", k, ...data }, { droppable }); }
  #ghostValues(emptyCheck) {
    const v = {};
    for (const i of qa("tr.ghost input[data-g]")) if (i.value) v[i.dataset.g] = i.value;
    return emptyCheck ? Object.keys(v).length > 0 : Object.keys(v).length ? v : null;
  }
  #poll() {
    const c = this.getCtx();
    const key = `${c.view}|${c.dmode}|${c.db}|${c.table}|${c.active}|${c.pv}|${c.pvPath}|${c.pan?.join(",")}|${c.zoom}`;
    if (key !== this.lastKey) { this.lastKey = key; this.local("view", c); }
    const d = q("#sv .rubber")?.getAttribute("d") ?? null;
    const rubber = d ? { d, pan: c.pan ?? [0, 0], zoom: c.zoom ?? 1 } : null;
    const rubberKey = JSON.stringify(rubber);
    if (rubberKey !== this.lastRubber) { this.lastRubber = rubberKey; this.local("rubber", { rubber }); }
  }
  #surface(e) {
    const pv = q("#pvFrames"), sv = q("#sv");
    for (const [id, el] of [["pv", pv], ["sv", sv]]) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom && r.width > 0) return { s: id, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    }
    return null;
  }
  #pointer(e, click) {
    const s = this.#surface(e);
    if (!s) { if (this.hadSurface) { this.hadSurface = false; this.mouse.set("mouse", { k: "mouse", s: null }); } return; }
    this.hadSurface = true;
    this.mouse.set("mouse", { k: "mouse", ...s, click });
    if (click) this.mouse.flushNow();
  }
  #bindFrames() {
    for (const frame of qa("#pvFrames iframe")) {
      if (frame.__cbFocusBound) continue;
      frame.__cbFocusBound = true;
      const bind = () => {
        try {
          const doc = frame.contentDocument;
          if (!doc || frame.__cbDoc === doc) return;
          frame.__cbDoc = doc;
          const point = (e, click = false) => {
            const box = q("#pvFrames"), f = frame.getBoundingClientRect(), r = box?.getBoundingClientRect();
            if (!box || !r?.width || !r.height) return;
            const x = (f.left + e.clientX - r.left) / r.width, y = (f.top + e.clientY - r.top) / r.height;
            this.mouse.set("mouse", { k: "mouse", s: "pv", x, y, click });
            if (click) this.mouse.flushNow();
            return { x, y };
          };
          doc.addEventListener("pointermove", (e) => point(e), { passive: true });
          doc.addEventListener("click", (e) => {
            const at = point(e, true);
            if (at) this.onPreview?.({ kind: "click", ...at, button: e.button });
          }, true);
          for (const type of ["input", "change"]) doc.addEventListener(type, (e) => {
            const at = point(e);
            const t = e.target;
            if (!at || !t || !("value" in t)) return;
            this.onPreview?.({ kind: type, ...at, target: { id: t.id, name: t.name, type: t.type, value: t.value, checked: t.checked } });
          }, true);
        } catch { /* cross-origin preview: show no remote pointer inside it */ }
      };
      frame.addEventListener("load", bind);
      bind();
    }
  }
  /* ---- remote -> UI ---- */
  receive(from, m) {
    const st = this.remote.get(from) ?? {};
    switch (m.k) {
      case "view": Object.assign(st, { view: m.view, dmode: m.dmode, table: m.table, db: m.db, active: m.active, pv: m.pv, pvPath: m.pvPath, pan: m.pan, zoom: m.zoom, file: m.active || null, cell: null, col: null, ghost: null }); break;
      case "cell": Object.assign(st, { cell: { table: m.table, r: m.r, c: m.c, editing: !!m.editing, value: m.value }, col: null, ghost: null }); break;
      case "col": Object.assign(st, { col: { table: m.table, name: m.name }, cell: null, ghost: null }); break;
      case "ghost": st.ghost = m.values || m.col ? { table: m.table, col: m.col, values: m.values } : null; break;
      case "rubber": st.rubber = m.rubber ?? null; break;
      case "mouse": st.mouse = m.s ? { s: m.s, x: m.x, y: m.y, click: m.click } : null; if (m.click && m.s) this.onClick?.(from, m); break;
    }
    st.at = Date.now();
    this.remote.set(from, st);
    this.schedule();
  }
  drop(id) { this.remote.delete(id); this.schedule(); }
  schedule() { if (this.scheduled) return; this.scheduled = true; requestAnimationFrame(() => { this.scheduled = false; this.render(); }); }
  clearMarks() {
    for (const n of this.marks.splice(0)) {
      if (n.dataset?.cbFocus !== undefined && !n.classList.contains("cb-ghostline")) { delete n.dataset.cbFocus; delete n.dataset.cbName; n.style.removeProperty("--c"); n.style.removeProperty("--cb"); n.style.removeProperty("--cs"); }
      else n.remove();
    }
  }
  #mark(el, p) {
    if (!el) return;
    el.dataset.cbFocus = "";
    el.dataset.cbName = p.name;
    for (const [k, v] of Object.entries(Object.fromEntries(cssVars(p.name, p.variant).split(";").map((x) => x.split(":"))))) el.style.setProperty(k, v);
    this.marks.push(el);
  }
  render() {
    this.mo.disconnect();
    try {
      this.clearMarks();
      const c = this.getCtx();
      const files = new Map();
      for (const [id, st] of this.remote) {
        const p = this.peer(id);
        if (!p || p.state === "away") continue;
        if (st.file) (files.get(st.file) ?? files.set(st.file, []).get(st.file)).push(p);
        const sameTable = (t) => c.view === "data" && t === c.table;
        if (st.cell && sameTable(st.cell.table)) {
          const cell = q(`td[data-r="${st.cell.r}"][data-c="${st.cell.c}"]`);
          this.#mark(cell, p);
          if (cell && st.cell.editing) {
            const value = document.createElement("span");
            value.className = "cb-live-value";
            value.style.cssText = cssVars(p.name, p.variant);
            value.textContent = `${p.name} : ${st.cell.value ?? ""}`;
            cell.append(value);
            this.marks.push(value);
          }
        }
        if (st.col && sameTable(st.col.table)) this.#mark(q(`tr[data-col="${esc(st.col.name)}"]`), p);
        if (st.ghost && st.ghost.table === c.table) this.#ghostRow(st.ghost, p);
        if (st.rubber) this.#rubber(st.rubber, p);
        if (st.mouse) this.#mouse(id, st.mouse, p);
      }
      for (const n of qa(".cb-mouse")) if (!this.remote.get(n.dataset.peer)?.mouse) n.remove();
      this.#badges(files);
    } finally {
      this.mo.observe(q("#main") ?? document.body, { childList: true, subtree: true });
      this.mo.observe(q("#tree") ?? document.body, { childList: true, subtree: true });
    }
  }
  #badges(files) {
    for (const old of qa("#tree .cb-badges")) old.remove();
      for (const row of qa("#tree [data-path][data-kind=file]")) {
      const list = files.get(row.dataset.path);
      if (!list?.length) continue;
      const wrap = document.createElement("span");
      wrap.className = "cb-badges";
      list.forEach((p) => {
        const a = document.createElement("span");
        a.className = "cb-av cb-sm";
        a.style.cssText = cssVars(p.name, p.variant);
        a.title = p.name;
        a.textContent = initial(p.name);
        wrap.append(a);
      });
      row.insertBefore(wrap, row.querySelector(".acts"));
      this.marks.push(wrap);
    }
  }
  #ghostRow(g, p) {
    const own = q("tr.ghost");
    if (!own || !g.values) return;
    const tr = document.createElement("tr");
    tr.className = "cb-ghostline";
    tr.dataset.cbFocus = "";
    tr.dataset.cbName = p.name;
    tr.setAttribute("aria-label", `Ligne en cours de saisie par ${p.name}`);
    tr.style.cssText = cssVars(p.name, p.variant);
    const cols = qa("td", own).length;
    tr.append(document.createElement("td"));
    const heads = qa("thead th, .grid thead th");
    const names = own.querySelectorAll("input[data-g]");
    names.forEach((i) => { const td = document.createElement("td"); td.textContent = g.values[i.dataset.g] ?? ""; td.style.opacity = g.values[i.dataset.g] ? "1" : ".4"; tr.append(td); });
    void cols; void heads;
    tr.append(document.createElement("td"));
    own.before(tr);
    this.marks.push(tr);
  }
  #rubber(data, p) {
    const sv = q("#sv");
    if (!sv) return;
    const { d, pan = [0, 0], zoom = 1 } = data;
    const path = document.createElementNS(SVGNS, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", p ? getComputedStyle(document.documentElement).getPropertyValue("--signal") : "");
    path.setAttribute("stroke-width", "2.5");
    path.setAttribute("stroke-dasharray", "6 4");
    const c = this.getCtx();
    const localZoom = Math.max(.01, c.zoom ?? 1);
    const s = zoom / localZoom;
    const x = (pan[0] - (c.pan?.[0] ?? 0)) / localZoom;
    const y = (pan[1] - (c.pan?.[1] ?? 0)) / localZoom;
    path.setAttribute("transform", `translate(${x} ${y}) scale(${s})`);
    path.style.cssText = cssVars(p.name, p.variant) + ";stroke:var(--cb)";
    path.setAttribute("class", "cb-rubber");
    (sv.querySelector("g") ?? sv).append(path);
    this.marks.push(path);
  }
  #mouse(id, m, p) {
    const surface = q(m.s === "pv" ? "#pvFrames" : "#sv");
    let n = q(`.cb-mouse[data-peer="${esc(id)}"]`);
    if (!surface) return n?.remove();
    const r = surface.getBoundingClientRect();
    if (!n) {
      n = document.createElement("div");
      n.className = "cb-mouse";
      n.dataset.peer = id;
      n.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 1l11 5-4.6 1.7L6.6 13z"/></svg><span></span>';
      n.querySelector("span").textContent = p.name;
      document.body.append(n);
    }
    n.style.cssText = cssVars(p.name, p.variant) + `;left:${r.left + m.x * r.width}px;top:${r.top + m.y * r.height}px`;
    if (m.click) {
      const ring = document.createElement("div");
      ring.className = "cb-click";
      ring.style.cssText = cssVars(p.name, p.variant) + `;left:${r.left + m.x * r.width}px;top:${r.top + m.y * r.height}px`;
      document.body.append(ring);
      setTimeout(() => ring.remove(), 700);
      m.click = false;
    }
  }
}

/** Host only: replay a remote click inside the real preview frame. */
export function replayClick(m) {
  if (m.s !== "pv") return false;
  const box = q("#pvFrames");
  if (!box) return false;
  const r = box.getBoundingClientRect();
  const x = r.left + m.x * r.width, y = r.top + m.y * r.height;
  for (const frame of qa("iframe", box)) {
    const f = frame.getBoundingClientRect();
    if (x < f.left || x > f.right || y < f.top || y > f.bottom) continue;
    try {
      const doc = frame.contentDocument;
      const target = doc?.elementFromPoint(x - f.left, y - f.top);
      if (!target) return false;
      target.dispatchEvent(new frame.contentWindow.MouseEvent("click", { bubbles: true, cancelable: true, clientX: x - f.left, clientY: y - f.top, view: frame.contentWindow }));
      return true;
    } catch { return false; } // cross-origin frame: pointer only
  }
  return false;
}

/** Replay a small, sanitized interaction from a guest in the host's live page. */
export function replayPreview(m) {
  if (!m || !["click", "input", "change"].includes(m.kind)) return false;
  const box = q("#pvFrames");
  if (!box) return false;
  const r = box.getBoundingClientRect(), x = r.left + m.x * r.width, y = r.top + m.y * r.height;
  for (const frame of qa("iframe", box)) {
    const f = frame.getBoundingClientRect();
    if (x < f.left || x > f.right || y < f.top || y > f.bottom) continue;
    try {
      const doc = frame.contentDocument, win = frame.contentWindow;
      if (!doc || !win) return false;
      if (m.kind === "click") {
        const target = doc.elementFromPoint(x - f.left, y - f.top);
        if (!target) return false;
        target.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, clientX: x - f.left, clientY: y - f.top, button: Number(m.button) || 0, view: win }));
      } else {
        const t = m.target ?? {};
        const at = doc.elementFromPoint(x - f.left, y - f.top);
        const target = t.id ? doc.getElementById(t.id) : (at?.name === t.name ? at : [...doc.getElementsByName(t.name || "")].find((n) => n.type === t.type) ?? at);
        if (!target || !("value" in target)) return false;
        if (target.type === "checkbox" || target.type === "radio") target.checked = !!t.checked;
        else target.value = String(t.value ?? "");
        target.dispatchEvent(new win.Event(m.kind, { bubbles: true, cancelable: false }));
      }
      return true;
    } catch { return false; }
  }
  return false;
}
