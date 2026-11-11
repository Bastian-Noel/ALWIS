// Presence on the shared UI without touching the views: local focus is read from the DOM
// (events), remote focus is painted back as outlines, badges, ghost rows and pointers.
import { cssVars, initial } from "./colors.mjs";
import { createCoalescer } from "./protocol.mjs";

const SVGNS = "http://www.w3.org/2000/svg";
const esc = (v) => (globalThis.CSS?.escape ? CSS.escape(String(v)) : String(v).replace(/["\\]/g, "\\$&"));
const q = (sel, root = document) => root.querySelector(sel);
const qa = (sel, root = document) => [...root.querySelectorAll(sel)];
const POINTER_TTL = 6000; // a pointer that has not moved for this long is hidden
const KEYED = new Set(["mouse", "viewport", "rubber", "cell", "ghost", "ncol", "view"]);

export class FocusLayer {
  /**
   * getCtx(): { view, dmode, table, db, active, pv, pvPath, pan, zoom, cw, ch } from the workbench state.
   * onViewport({cx, cy, zoom}): apply a shared schema viewport. onPeerView(id, state): a peer navigated.
   */
  constructor({ send, peer, getCtx, onClick, onPreview, previewInteractive = () => false, isFollowing = () => false, onViewport, onPeerView }) {
    Object.assign(this, { send, peer, getCtx, onClick, onPreview, previewInteractive, isFollowing, onViewport, onPeerView });
    this.remote = new Map(); // peerId -> { view, table, file, cell, col, ghost, ncol, mouse, rubber, at }
    this.own = null; // last view state we announced
    this.marks = [];
    this.scheduled = false;
    this.mouse = createCoalescer((batch) => { for (const m of batch) this.send({ t: "focus", ...m }, { key: "focus:mouse", droppable: true }); }, 40);
    this.mo = new MutationObserver(() => this.schedule());
    this.frameMO = new MutationObserver(() => this.#bindFrames());
    this.listeners = [];
    this.lastViewportAt = 0;
    this.tick = 0;
  }
  start() {
    const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); this.listeners.push(() => target.removeEventListener(type, fn, opts)); };
    const ctx = () => this.getCtx();
    const cellOf = (t) => t.closest?.("td[data-r][data-c]");
    on(document, "focusin", (e) => {
      const t = e.target;
      const cell = cellOf(t);
      if (cell) return this.local("cell", { ...ctx(), r: +cell.dataset.r, c: +cell.dataset.c, editing: t.matches?.("input.ce"), value: t.value });
      const row = t.closest?.("tr[data-col]");
      if (row) return this.local("col", { ...ctx(), name: row.dataset.col });
      if (t.matches?.("input[data-g]")) return this.local("ghost", { ...ctx(), col: t.dataset.g, values: this.#ghostValues() ?? {} });
      if (this.#isNewColumn(t)) return this.#sendNewColumn(ctx());
    });
    // A grid selection may not take DOM focus in every browser: publish it on click too.
    on(document, "pointerdown", (e) => {
      const cell = cellOf(e.target);
      if (cell) return this.local("cell", { ...ctx(), r: +cell.dataset.r, c: +cell.dataset.c, editing: false });
      const row = e.target.closest?.("tr[data-col]");
      if (row) this.local("col", { ...ctx(), name: row.dataset.col });
    });
    on(document, "input", (e) => {
      const t = e.target;
      if (t.matches?.("input[data-g]")) this.local("ghost", { ...ctx(), col: t.dataset.g, values: this.#ghostValues() ?? {} });
      else if (t.matches?.("input.ce")) { const cell = cellOf(t); if (cell) this.local("cell", { ...ctx(), r: +cell.dataset.r, c: +cell.dataset.c, editing: true, value: t.value }); }
      else if (this.#isNewColumn(t)) this.#sendNewColumn(ctx());
    });
    on(document, "change", (e) => { if (this.#isNewColumn(e.target)) this.#sendNewColumn(ctx()); });
    on(document, "focusout", (e) => {
      const t = e.target;
      if (t.matches?.("input[data-g]") && !this.#ghostValues(true)) this.local("ghost", { ...ctx(), values: null });
      if (t.matches?.("input.ce")) { const cell = cellOf(t); if (cell) this.local("cell", { ...ctx(), r: +cell.dataset.r, c: +cell.dataset.c, editing: false }); }
    });
    on(window, "message", event => {
      const m = event.data;
      if (m?.type !== "alwis-preview-presence") return;
      const frames = qa("#pvFrames iframe"), frame = frames.find(f => f.contentWindow === event.source);
      if (!frame) return;
      const url = new URL(frame.src, location.href);
      const channel = url.pathname.match(/^\/__alwis-guest\/([a-f0-9]{32})\//)?.[1];
      if (!channel || m.channel !== channel || event.origin !== url.origin || !Number.isFinite(m.sx) || !Number.isFinite(m.sy)) return;
      frame.__cbScroll = { x: m.sx, y: m.sy };
      if (m.kind === "pointer" && Number.isFinite(m.x) && Number.isFinite(m.y))
        this.mouse.set("mouse", { k: "mouse", s: "pv", space: "document", frame: frames.indexOf(frame), x: m.x, y: m.y, click: false });
      if (m.kind === "scroll" && Date.now() >= (frame.__cbApplyingScrollUntil || 0)) this.local("preview-scroll", { frame: frames.indexOf(frame), x: m.sx, y: m.sy }, true);
      this.schedule();
    });
    on(document, "pointermove", (e) => this.#pointer(e, false), { passive: true });
    on(document, "pointerdown", (e) => this.#pointer(e, true), { passive: true });
    on(document, "pointerleave", () => this.#hide(), { passive: true });
    this.poll = setInterval(() => this.#poll(), 120);
    this.sweep = setInterval(() => this.#sweep(), 1000);
    this.announce(true);
    this.#bindFrames();
    this.frameMO.observe(q("#pvFrames") ?? document.body, { childList: true, subtree: true });
    const main = q("#main") ?? document.body;
    this.mo.observe(main, { childList: true, subtree: true });
    this.mo.observe(q("#tree") ?? main, { childList: true, subtree: true });
  }
  stop() {
    clearInterval(this.poll);
    clearInterval(this.sweep);
    this.mo.disconnect();
    this.frameMO.disconnect();
    this.listeners.splice(0).forEach((off) => off());
    this.mouse.clear();
    this.clearMarks();
    qa(".cb-mouse").forEach((n) => n.remove());
  }
  /* ---- local -> remote ---- */
  local(k, data, droppable = false) {
    this.send({ t: "focus", k, ...data }, { droppable, key: KEYED.has(k) ? `focus:${k}` : null });
  }
  /** Announce where we are (view, file, table). `force` also resends an unchanged state (late joiners, keep-alive). */
  announce(force = false) {
    const c = this.getCtx();
    const key = `${c.view}|${c.dmode}|${c.db}|${c.table}|${c.active}|${c.pv}|${c.pvPath}`;
    if (!force && key === this.lastKey) return;
    this.lastKey = key;
    this.own = { ...c };
    this.local("view", c);
  }
  /** Everything we know, for a peer that just arrived. */
  snapshot(except = null) {
    return { own: this.own ?? this.getCtx(), states: [...this.remote].filter(([id]) => id !== except).map(([id, st]) => [id, this.#plain(st)]) };
  }
  #plain(st) { const { mouse, ...rest } = st; return rest; }
  applySnapshot(msg, ownerId = "h", selfId = null) {
    if (msg.own) this.receive(ownerId, { k: "view", ...msg.own }, { silent: true });
    for (const [id, st] of msg.states ?? []) {
      if (id === selfId) continue; // never paint ourselves from a stale copy
      const prev = this.remote.get(id) ?? {};
      this.remote.set(id, { ...prev, ...st, at: Date.now() });
    }
    this.schedule();
  }
  #ghostValues(emptyCheck) {
    const v = {};
    for (const i of qa("tr.ghost input[data-g]")) if (i.value) v[i.dataset.g] = i.value;
    return emptyCheck ? Object.keys(v).length > 0 : Object.keys(v).length ? v : null;
  }
  /** The "Ajouter une colonne" dialog (or the inline #nc* form): what is being typed before it is validated. */
  #isNewColumn(t) {
    if (!t?.matches) return false;
    if (t.matches("#ncName, #ncType, #ncNull")) return true;
    const d = t.closest("dialog[open]");
    return !!d && !!d.querySelector("#column-type");
  }
  #newColumn() {
    const d = q("dialog[open]:has(#column-type)") ?? document;
    const field = (k) => d.querySelector(`[data-f="${k}"]`);
    const label = (e) => (e?.tagName === "SELECT" ? e.options[e.selectedIndex]?.text ?? "" : e?.value ?? "");
    return {
      name: field("name")?.value ?? q("#ncName")?.value ?? "",
      type: q("#column-type")?.value ?? q("#ncType")?.value ?? "",
      size: q("#column-size")?.value ?? "",
      key: label(field("key")),
    };
  }
  #sendNewColumn(ctx) { this.ncolOpen = true; this.local("ncol", { ...ctx, ...this.#newColumn() }); }
  #poll() {
    this.tick++;
    const c = this.getCtx();
    this.announce(this.tick % 33 === 0); // keep-alive about every 4 s
    if (c.view === "schema") this.#viewport(c);
    if (this.ncolOpen && !q("dialog[open] #column-type") && !q("#ncName")) { this.ncolOpen = false; this.local("ncol", { ...c, name: null }); }
    const d = q("#sv .rubber")?.getAttribute("d") ?? null;
    const rubber = d ? { d, pan: c.pan ?? [0, 0], zoom: c.zoom ?? 1 } : null;
    const rubberKey = JSON.stringify(rubber);
    if (rubberKey !== this.lastRubber) { this.lastRubber = rubberKey; this.local("rubber", { rubber }); }
  }
  /* Shared schema viewport: expressed as the world point at the centre of the canvas, so
     two people with different window sizes look at the same thing. */
  #viewport(c) {
    if (!Array.isArray(c.pan) || !c.cw) return;
    const z = c.zoom || 1;
    const cx = (c.cw / 2 - c.pan[0]) / z, cy = (c.ch / 2 - c.pan[1]) / z;
    const key = `${Math.round(cx)}|${Math.round(cy)}|${Math.round(z * 100)}`;
    if (key === this.lastViewport) return;
    this.lastViewport = key;
    this.schedule(); // reproject remote world pointers when our own pan/zoom changes
    if (this.applyingViewport) return; // that change came from somebody else
    this.lastViewportAt = Date.now();
    this.local("viewport", { cx, cy, zoom: z }, true);
  }
  #sweep() { // hide stale pointers
    let changed = false;
    for (const st of this.remote.values()) if (st.mouse && Date.now() - st.mouse.at > POINTER_TTL) { st.mouse = null; changed = true; }
    if (changed) this.schedule();
  }
  #hide() { if (this.hadSurface) { this.hadSurface = false; this.mouse.set("mouse", { k: "mouse", s: null }); } }
  #surface(clientX, clientY) {
    for (const [id, el] of [["pv", q("#pvFrames")], ["sv", q("#sv")]]) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        if (id === "sv") {
          const c = this.getCtx(), z = c.zoom || 1;
          return { s: id, space: "world", x: (clientX - r.left - (c.pan?.[0] || 0)) / z,
            y: (clientY - r.top - (c.pan?.[1] || 0)) / z };
        }
        return { s: id, x: (clientX - r.left) / r.width, y: (clientY - r.top) / r.height };
      }
    }
    return null;
  }
  #pointer(e, click) {
    const s = this.#surface(e.clientX, e.clientY);
    if (!s) return this.#hide();
    this.hadSurface = true;
    // Clicks inside the preview travel as `preview-event` (by target element), never as raw mouse clicks.
    this.mouse.set("mouse", { k: "mouse", ...s, click: click && s.s !== "pv" });
    if (click) this.mouse.flushNow();
  }
  #bindFrames() {
    for (const frame of qa("#pvFrames iframe")) {
      if (frame.__cbFocusBound) continue;
      frame.__cbFocusBound = true;
      const listen = (target, type, handler, options) => {
        target.addEventListener(type, handler, options);
        this.listeners.push(() => target.removeEventListener(type, handler, options));
      };
      this.listeners.push(() => { delete frame.__cbFocusBound; delete frame.__cbDoc; });
      const bind = () => {
        let doc;
        try { doc = frame.contentDocument; } catch { return; } // cross-origin: no pointer inside it
        if (!doc || frame.__cbDoc === doc) return;
        frame.__cbDoc = doc;
        const point = (e) => {
          const f = frame.getBoundingClientRect();
          const s = this.#surface(f.left + e.clientX, f.top + e.clientY);
          if (!s) return null;
          this.hadSurface = true;
          this.mouse.set("mouse", { k: "mouse", s: "pv", space: "document",
            frame: qa("#pvFrames iframe").indexOf(frame), x: e.clientX + doc.defaultView.scrollX,
            y: e.clientY + doc.defaultView.scrollY, click: false });
          return s;
        };
        const target = (e) => {
          const el = e.target?.closest?.("[data-cbi]") ?? e.target;
          const i = el?.getAttribute?.("data-cbi");
          return { i: i == null ? null : +i, tag: el?.tagName ?? null };
        };
        listen(doc, "scroll", e => {
          this.schedule();
          if (Date.now() >= (frame.__cbApplyingScrollUntil || 0)) this.local("preview-scroll", {
            frame: qa("#pvFrames iframe").indexOf(frame), x: doc.defaultView.scrollX, y: doc.defaultView.scrollY,
          }, true);
          if (!this.onPreview || this.previewInteractive() || Date.now() < (frame.__cbApplyingScrollUntil || 0)) return;
          const el = e.target;
          const root = el === doc || el === doc.documentElement || el === doc.body;
          this.onPreview({ kind: "scroll", i: root ? null : +(el.getAttribute?.("data-cbi") ?? -1),
            x: root ? doc.defaultView.scrollX : el.scrollLeft, y: root ? doc.defaultView.scrollY : el.scrollTop });
        }, { capture: true, passive: true });
        listen(doc, "pointermove", point, { passive: true });
        listen(doc, "pointerdown", point, { passive: true });
        listen(doc, "click", (e) => {
          const at = point(e);
          // Intercept navigation ONLY in the inert DOM mirror. Real guest previews
          // and the host preview must retain native links, forms and JavaScript.
          const mirror = !!this.onPreview && !this.previewInteractive();
          if (mirror && e.target.closest?.("a, form")) e.preventDefault();
          if (at) {
            this.mouse.flushNow();
            if (mirror) this.onPreview({ kind: "click", ...at, ...target(e), button: e.button });
          }
        }, true);
        for (const type of ["input", "change"]) listen(doc, type, (e) => {
          const t = e.target;
          if (!t || !("value" in t)) return;
          if (this.onPreview && !this.previewInteractive())
            this.onPreview({ kind: type, ...target(e), target: { id: t.id, name: t.name, type: t.type, value: t.value, checked: t.checked } });
        }, true);
      };
      listen(frame, "load", bind);
      bind();
    }
  }
  /* ---- remote -> UI ---- */
  receive(from, m, { silent = false } = {}) {
    const st = this.remote.get(from) ?? {};
    switch (m.k) {
      case "view": {
        const moved = st.view !== m.view || st.table !== m.table || st.active !== m.active || st.db !== m.db || st.pv !== m.pv || st.dmode !== m.dmode;
        Object.assign(st, { view: m.view, dmode: m.dmode, table: m.table, db: m.db, active: m.active, pv: m.pv, pvPath: m.pvPath, pan: m.pan, zoom: m.zoom, file: m.view === "code" ? m.active || null : null });
        if (moved) { st.cell = null; st.col = null; st.ghost = null; st.ncol = null; }
        st.at = Date.now();
        this.remote.set(from, st);
        this.schedule();
        if (moved && !silent) this.onPeerView?.(from, st);
        return;
      }
      case "cell": Object.assign(st, { cell: { table: m.table, r: m.r, c: m.c, editing: !!m.editing, value: m.value }, col: null, ghost: null }); break;
      case "col": Object.assign(st, { col: { table: m.table, name: m.name }, cell: null, ghost: null }); break;
      case "ghost": st.ghost = m.values || m.col ? { table: m.table, col: m.col, values: m.values } : null; break;
      case "ncol": st.ncol = m.name == null ? null : { table: m.table, name: m.name, type: m.type, size: m.size, key: m.key }; break;
      case "rubber": st.rubber = m.rubber ?? null; break;
      case "preview-scroll": {
        st.previewScroll = { x: m.x, y: m.y, frame: m.frame };
        if (this.isFollowing(from) && Number.isFinite(m.x) && Number.isFinite(m.y)) {
          const frame = qa("#pvFrames iframe")[m.frame ?? 0];
          if (frame) {
            frame.__cbApplyingScrollUntil = Date.now() + 250;
            try {
              if (frame.contentDocument) frame.contentWindow.scrollTo(m.x, m.y);
              else {
                const url = new URL(frame.src, location.href), channel = url.pathname.match(/^\/__alwis-guest\/([a-f0-9]{32})\//)?.[1];
                if (channel) frame.contentWindow.postMessage({ type: "alwis-preview-scroll", channel, x: m.x, y: m.y }, url.origin);
              }
            } catch {}
          }
        }
        break;
      }
      case "viewport": {
        st.viewport = { cx: m.cx, cy: m.cy, zoom: m.zoom };
        // Remote navigation changes our viewport only for the explicitly followed peer.
        if (this.isFollowing(from) && this.getCtx().view === "schema" && this.onViewport) {
          this.applyingViewport = true;
          try { this.onViewport(st.viewport); } finally { setTimeout(() => (this.applyingViewport = false), 150); }
        }
        break;
      }
      case "mouse": st.mouse = m.s ? { s: m.s, space: m.space, frame: m.frame, x: m.x, y: m.y, click: m.click, at: Date.now() } : null; if (m.click && m.s) this.onClick?.(from, m); break;
    }
    st.at = Date.now();
    this.remote.set(from, st);
    this.schedule();
  }
  drop(id) { this.remote.delete(id); qa(`.cb-mouse[data-peer="${esc(id)}"]`).forEach((n) => n.remove()); this.schedule(); }
  schedule() { if (this.scheduled) return; this.scheduled = true; requestAnimationFrame(() => { this.scheduled = false; this.render(); }); }
  clearMarks() {
    for (const n of this.marks.splice(0)) {
      if (n.dataset?.cbFocus !== undefined && !n.classList.contains("cb-ghostline") && !n.classList.contains("cb-ncol")) {
        delete n.dataset.cbFocus; delete n.dataset.cbName;
        for (const k of ["--c", "--cb", "--cs", "--cf"]) n.style.removeProperty(k);
      } else n.remove();
    }
  }
  #mark(el, p) {
    if (!el) return;
    el.dataset.cbFocus = "";
    el.dataset.cbName = p.name;
    for (const part of cssVars(p.name, p.variant).split(";")) { const [k, v] = part.split(":"); if (k) el.style.setProperty(k, v); }
    this.marks.push(el);
  }
  render() {
    this.mo.disconnect();
    try {
      this.clearMarks();
      const c = this.getCtx();
      const files = new Map();
      const live = new Set();
      for (const [id, st] of this.remote) {
        const p = this.peer(id);
        if (!p || p.state === "away") continue;
        if (st.file) (files.get(st.file) ?? files.set(st.file, []).get(st.file)).push(p);
        const dataHere = c.view === "data" && c.dmode === "data";
        const structHere = c.view === "data" && c.dmode === "struct";
        const sameTable = (t) => t === c.table;
        if (st.cell && dataHere && sameTable(st.cell.table)) {
          const cell = q(`td[data-r="${st.cell.r}"][data-c="${st.cell.c}"]`);
          this.#mark(cell, p);
          if (cell && st.cell.editing) {
            const value = document.createElement("span");
            value.className = "cb-live-value";
            value.style.cssText = cssVars(p.name, p.variant);
            value.textContent = st.cell.value ?? "";
            value.dataset.who = p.name;
            cell.append(value);
            this.marks.push(value);
          }
        }
        if (st.col && structHere && sameTable(st.col.table)) this.#mark(q(`tr[data-col="${esc(st.col.name)}"]`), p);
        if (st.ghost && dataHere && sameTable(st.ghost.table)) this.#ghostRow(st.ghost, p);
        if (st.ncol && structHere && sameTable(st.ncol.table)) this.#newColumnRow(st.ncol, p);
        if (st.rubber && c.view === "schema") this.#rubber(st.rubber, p);
        if (st.mouse && Date.now() - st.mouse.at < POINTER_TTL) { this.#mouse(id, st.mouse, p); live.add(id); }
      }
      for (const n of qa(".cb-mouse")) if (!live.has(n.dataset.peer)) n.remove();
      this.#badges(files);
    } finally {
      this.mo.observe(q("#main") ?? document.body, { childList: true, subtree: true });
      this.mo.observe(q("#tree") ?? document.body, { childList: true, subtree: true });
    }
  }
  #badges(files) {
    for (const old of qa("#tree .cb-badges")) old.remove();
    const rows = qa("#tree [data-path][data-kind]");
    const byPath = new Map(rows.map(row => [row.dataset.path, row]));
    const visible = new Map();
    for (const [path, peers] of files) {
      let row = byPath.get(path);
      if (!row) {
        // Attach to the nearest visible collapsed ancestor, never a sibling prefix.
        row = rows.filter(r => r.dataset.kind === "dir" && r.getAttribute("aria-expanded") === "false"
          && path.startsWith(r.dataset.path + "/"))
          .sort((a, b) => b.dataset.path.length - a.dataset.path.length)[0];
      }
      if (!row) continue;
      const people = visible.get(row) ?? new Map();
      for (const peer of peers) people.set(peer.id, peer);
      visible.set(row, people);
    }
    for (const [row, people] of visible) {
      const list = [...people.values()];
      const folder = row.dataset.kind === "dir";
      const wrap = document.createElement("span");
      wrap.className = "cb-badges";
      wrap.setAttribute("aria-label", `${folder ? "Fichiers du dossier ouverts par" : "Ouvert par"} ${list.map((p) => p.name).join(", ")}`);
      list.forEach((p) => {
        const a = document.createElement("span");
        a.className = "cb-av cb-sm";
        a.style.cssText = cssVars(p.name, p.variant);
        a.title = `${p.name} modifie ${folder ? "un fichier dans ce dossier" : "ce fichier"}`;
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
    const first = document.createElement("td");
    first.className = "ck";
    first.textContent = "+";
    tr.append(first);
    own.querySelectorAll("input[data-g]").forEach((i) => {
      const td = document.createElement("td");
      td.textContent = g.values[i.dataset.g] ?? "";
      td.classList.toggle("cb-active", g.col === i.dataset.g);
      tr.append(td);
    });
    tr.append(document.createElement("td"));
    own.before(tr);
    this.marks.push(tr);
  }
  #newColumnRow(n, p) {
    const anchor = qa("tr[data-col]").at(-1);
    if (!anchor) return;
    const tr = document.createElement("tr");
    tr.className = "cb-ncol";
    tr.dataset.cbFocus = "";
    tr.dataset.cbName = p.name;
    tr.style.cssText = cssVars(p.name, p.variant);
    const td = document.createElement("td");
    td.colSpan = 99;
    const type = n.type ? n.type + (n.size && !/^(TEXT|BLOB|DATE|DATETIME|JSON|BOOLEAN)$/i.test(n.type) ? `(${n.size})` : "") : "";
    td.textContent = `${n.name || "…"}${type ? "  ·  " + type : ""}${n.key && n.key !== "Aucune" ? "  ·  " + n.key : ""}`;
    tr.append(td);
    anchor.after(tr);
    this.marks.push(tr);
  }
  #rubber(data, p) {
    const sv = q("#sv");
    if (!sv) return;
    const { d } = data;
    const path = document.createElementNS(SVGNS, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-width", "2.5");
    path.setAttribute("stroke-dasharray", "6 4");
    path.style.cssText = cssVars(p.name, p.variant) + ";stroke:var(--cb)";
    path.setAttribute("class", "cb-rubber");
    (sv.querySelector("#layer") ?? sv).append(path);
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
    let x = r.left + m.x * r.width, y = r.top + m.y * r.height;
    if (m.s === "sv" && m.space === "world") {
      const c = this.getCtx();
      x = r.left + m.x * (c.zoom || 1) + (c.pan?.[0] || 0);
      y = r.top + m.y * (c.zoom || 1) + (c.pan?.[1] || 0);
    } else if (m.s === "pv" && m.space === "document") {
      const frame = qa("#pvFrames iframe")[m.frame ?? 0];
      if (!frame) return n.remove();
      const f = frame.getBoundingClientRect();
      let scroll = frame.__cbScroll ?? { x: 0, y: 0 };
      try { if (frame.contentDocument) scroll = { x: frame.contentWindow.scrollX, y: frame.contentWindow.scrollY }; } catch {}
      x = f.left + m.x - scroll.x; y = f.top + m.y - scroll.y;
      if (x < f.left || x > f.right || y < f.top || y > f.bottom) return n.remove();
    }
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return n.remove();
    n.style.cssText = cssVars(p.name, p.variant) + `;left:${x}px;top:${y}px`;
    if (m.click) {
      const ring = document.createElement("div");
      ring.className = "cb-click";
      ring.style.cssText = cssVars(p.name, p.variant) + `;left:${x}px;top:${y}px`;
      document.body.append(ring);
      setTimeout(() => ring.remove(), 700);
      m.click = false;
    }
  }
}

/** Host only: replay a remote click inside the real preview frame. */
export function replayClick(m) {
  if (m.s !== "pv") return false;
  return replayPreview({ kind: "click", ...m });
}

/**
 * Replay a small, sanitised guest interaction in the host's live page. The target is the
 * element index recorded in the snapshot (`data-cbi`), so it does not depend on window sizes;
 * coordinates are only a fallback.
 */
export function replayPreview(m) {
  if (!m || !["click", "input", "change", "scroll"].includes(m.kind)) return false;
  const box = q("#pvFrames");
  if (!box) return false;
  const frame = qa("iframe", box).find((f) => f.offsetParent !== null) ?? q("iframe", box);
  if (!frame) return false;
  try {
    const doc = frame.contentDocument, win = frame.contentWindow;
    if (!doc || !win) return false;
    if (m.kind === "scroll" && !Number.isInteger(m.i)) {
      if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) return false;
      win.scrollTo(m.x, m.y); return true;
    }
    let el = null;
    if (Number.isInteger(m.i)) {
      const cand = doc.querySelectorAll("*")[m.i];
      if (cand && (!m.tag || cand.tagName === m.tag)) el = cand;
    }
    if (!el && Number.isFinite(m.x)) {
      const r = box.getBoundingClientRect(), f = frame.getBoundingClientRect();
      el = doc.elementFromPoint(r.left + m.x * r.width - f.left, r.top + m.y * r.height - f.top);
    }
    if (!el) return false;
    if (m.kind === "scroll") {
      if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) return false;
      el.scrollLeft = m.x; el.scrollTop = m.y; return true;
    }
    if (m.kind === "click") {
      if ((Number(m.button) || 0) === 0 && typeof el.click === "function") el.click();
      else el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: Number(m.button) || 0, view: win }));
      return true;
    }
    const t = m.target ?? {};
    const target = "value" in el ? el : (t.id ? doc.getElementById(t.id) : null) ?? [...doc.getElementsByName(t.name || "")].find((n) => n.type === t.type);
    if (!target || !("value" in target)) return false;
    if (target.type === "checkbox" || target.type === "radio") target.checked = !!t.checked;
    else target.value = String(t.value ?? "");
    target.dispatchEvent(new win.Event(m.kind, { bubbles: true, cancelable: false }));
    return true;
  } catch { return false; }
}
