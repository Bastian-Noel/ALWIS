// Document synchronisation glue. `lib` = { ChangeSet, Text, HostLog, GuestSync } (from the editor bundle).
// Host holds the authoritative text per opened path; guests send ChangeSets and rebase.
import { chunkText } from "./protocol.mjs";

const textOf = (Text, s) => Text.of(String(s).split(/\r\n|\r|\n/)); // CM normalises line breaks

export class DocHost {
  constructor({ lib, send, loadText, onHeadless, editorFor, peer, log = () => {} }) {
    Object.assign(this, { lib, send, loadText, onHeadless, editorFor, peer, log });
    this.entries = new Map(); // path -> { text, log, openers:Set }
    this.cursors = new Map(); // peerId -> { path, anchor, head, at }
  }
  async #ensure(path) {
    let e = this.entries.get(path);
    if (e) return e;
    const raw = await this.loadText(path);
    e = this.entries.get(path); // another open may have won while we awaited
    if (e) return e;
    e = { text: textOf(this.lib.Text, raw), log: new this.lib.HostLog(0), openers: new Set() };
    this.entries.set(path, e);
    return e;
  }
  has(path) { return this.entries.has(path); }
  async handle(from, msg) {
    switch (msg.t) {
      case "open": return this.#open(from, msg.path);
      case "ops": return this.#ops(from, msg);
      case "sync": return this.#catchUp(from, msg);
      case "aware": return this.#aware(from, msg);
      case "close-doc": this.entries.get(msg.path)?.openers.delete(from); this.cursors.delete(from); this.#fanCursor(from, null); return;
    }
  }
  async #open(from, path) {
    try {
      const e = await this.#ensure(path);
      e.openers.add(from);
      const text = e.text.toString();
      const parts = chunkText(text);
      parts.forEach((p, i) => this.send(from, { t: "file", path, version: e.log.version, part: i, parts: parts.length, text: p }));
      for (const [id, c] of this.cursors) if (id !== from && c.path === path) this.send(from, { t: "aware", k: "cursor", from: id, ...c }, { droppable: true });
    } catch (err) {
      this.send(from, { t: "file-error", path, message: String(err?.message ?? err) });
    }
  }
  #ops(from, { path, version, changes, cursor }) {
    const e = this.entries.get(path);
    if (!e || !e.openers.has(from)) return this.send(from, { t: "resync", path });
    const cs = e.log.rebase(version, changes, e.text.length);
    if (!cs) return this.send(from, { t: "resync", path });
    e.text = cs.apply(e.text);
    const u = e.log.record(cs, from);
    for (const id of e.openers) this.send(id, { t: "ops", path, version: u.version, id: from, changes: u.changes });
    const model = this.editorFor(path);
    if (model) model.applyRemote(cs, this.peer(from));
    else this.onHeadless(path, e.text.toString());
    if (cursor) this.#aware(from, { path, ...cursor });
  }
  /** Updates a guest missed while disconnected (or a full file if the log was trimmed). */
  #catchUp(from, { path, version }) {
    const e = this.entries.get(path);
    if (!e) return this.#open(from, path);
    if (!Number.isInteger(version) || version < e.log.first || version > e.log.version) return this.#open(from, path);
    e.openers.add(from);
    e.log.updates.slice(version - e.log.first).forEach((u, i) =>
      this.send(from, { t: "ops", path, version: version + i + 1, id: u.id, changes: u.changes.toJSON() }));
    this.send(from, { t: "caught-up", path, version: e.log.version });
  }
  /** Host edited the file in its own editor. */
  local(path, changes) {
    const e = this.entries.get(path);
    if (!e || changes.length !== e.text.length) { if (e) this.entries.delete(path); return; } // desync => drop; guests resync on next ops
    e.text = changes.apply(e.text);
    const u = e.log.record(changes, "h");
    for (const id of e.openers) this.send(id, { t: "ops", path, version: u.version, id: "h", changes: u.changes });
  }
  #aware(from, msg) {
    if (msg.k && msg.k !== "cursor") return;
    const c = { path: msg.path, anchor: msg.anchor, head: msg.head, at: Date.now() };
    this.cursors.set(from, c);
    this.#fanCursor(from, c);
  }
  #fanCursor(from, c) {
    const msg = { t: "aware", k: "cursor", from, ...(c ?? { path: null }) };
    const targets = new Set();
    for (const [path, e] of this.entries) if (!c || path === c.path) for (const id of e.openers) targets.add(id);
    targets.delete(from);
    for (const id of targets) this.send(id, msg, { droppable: true });
    if (c?.path) this.editorFor(c.path)?.showCursors([[from, this.#cursorEntry(from, c)]]);
  }
  #cursorEntry(id, c) { const p = this.peer(id); return { name: p.name, css: p.css, anchor: c.anchor, head: c.head, at: c.at }; }
  /** Host's own caret, shared with everybody who has the file open. */
  hostCursor(path, anchor, head) {
    const e = this.entries.get(path);
    if (!e) return;
    for (const id of e.openers) this.send(id, { t: "aware", k: "cursor", from: "h", path, anchor, head, at: Date.now() }, { droppable: true });
  }
  dropPeer(id) {
    for (const e of this.entries.values()) e.openers.delete(id);
    this.cursors.delete(id);
    for (const e of this.entries.values()) for (const o of e.openers) this.send(o, { t: "aware", k: "cursor", from: id, path: null }, { droppable: true });
    for (const [path] of this.entries) this.editorFor(path)?.showCursors([[id, null]]);
  }
  closeFile(path) { const e = this.entries.get(path); if (e && !e.openers.size) this.entries.delete(path); }
}

export class DocGuest {
  constructor({ lib, send, editorFor, peer, myId, onFile, onDesync, onHeadless }) {
    Object.assign(this, { lib, send, editorFor, peer, myId, onFile, onDesync, onHeadless });
    this.entries = new Map(); // path -> { sync, text:Text }
    this.loading = new Map(); // path -> { parts, resolve, reject }
  }
  /** Ask the host for a file; resolves with its text. */
  open(path) {
    const pending = this.loading.get(path);
    if (pending) return pending.promise;
    let resolve, reject;
    const promise = new Promise((a, b) => ((resolve = a), (reject = b)));
    this.loading.set(path, { parts: [], got: 0, resolve, reject, promise });
    this.send({ t: "open", path });
    return promise;
  }
  text(path) { return this.entries.get(path)?.text.toString(); }
  handle(msg, fromPeerId = "h") {
    switch (msg.t) {
      case "file": return this.#file(msg);
      case "file-error": { const l = this.loading.get(msg.path); this.loading.delete(msg.path); l?.reject(Error(msg.message)); return; }
      case "ops": return this.#ops(msg);
      case "resync": return this.#resync(msg.path);
      case "caught-up": { const m = this.entries.get(msg.path)?.sync.resend(); if (m) this.send({ t: "ops", path: msg.path, ...m }); return; }
      case "aware": return this.#aware(msg);
    }
  }
  #file(m) {
    let l = this.loading.get(m.path);
    if (!l) { // unsolicited: the host restarted or dropped our history => forced resync
      l = { parts: [], got: 0, resolve: () => {}, reject: () => {}, promise: null };
      this.loading.set(m.path, l);
    }
    l.parts[m.part] = m.text;
    if (++l.got < m.parts) return;
    this.loading.delete(m.path);
    const text = l.parts.join("");
    this.entries.set(m.path, { sync: new this.lib.GuestSync(this.myId(), m.version), text: textOf(this.lib.Text, text) });
    this.editorFor(m.path)?.swapDocument(text);
    l.resolve(text);
  }
  #ops(m) {
    const e = this.entries.get(m.path);
    if (!e) return;
    const r = e.sync.receive(m);
    if (r.gap) return this.catchUp(m.path);
    if (r.apply) {
      e.text = r.apply.apply(e.text);
      const model = this.editorFor(m.path);
      if (model) { if (!model.applyRemote(r.apply, this.peer(m.id))) return this.#resync(m.path); }
      else this.onHeadless?.(m.path, e.text.toString());
    }
    if (r.send) this.send({ t: "ops", path: m.path, ...r.send });
  }
  /** Local edit from the editor bound to `path`. */
  local(path, changes, cursor) {
    const e = this.entries.get(path);
    if (!e) return;
    e.text = changes.apply(e.text);
    const m = e.sync.local(changes);
    if (m) this.send({ t: "ops", path, ...m, cursor });
  }
  catchUp(path) { const e = this.entries.get(path); if (e) this.send({ t: "sync", path, version: e.sync.version }); }
  /** After a reconnect: ask for what we missed in every open file. */
  catchUpAll() { for (const p of this.entries.keys()) this.catchUp(p); }
  #resync(path) { this.entries.delete(path); this.onDesync?.(path); this.open(path).catch(() => {}); }
  cursor(path, anchor, head) { if (this.entries.has(path)) this.send({ t: "aware", k: "cursor", path, anchor, head }, { droppable: true }); }
  #aware(m) {
    if (m.k !== "cursor") return;
    const model = m.path && this.editorFor(m.path);
    const p = this.peer(m.from);
    this.cursorsSeen ??= new Map();
    const prev = this.cursorsSeen.get(m.from);
    if (prev && prev !== m.path) this.editorFor(prev)?.showCursors([[m.from, null]]);
    this.cursorsSeen.set(m.from, m.path);
    if (!m.path) return;
    model?.showCursors([[m.from, { name: p.name, css: p.css, anchor: m.anchor, head: m.head, at: m.at ?? Date.now() }]]);
  }
}
