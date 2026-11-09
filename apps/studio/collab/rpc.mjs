// Guest -> host calls on the real engine (files and database), lazy and chunked.
// The host is the only place where data lives; guests keep nothing between calls.
import { chunkText } from "./protocol.mjs";

export const ALLOWED = Object.freeze({
  read: new Set(["fs.list", "fs.read", "db.databases", "db.catalog", "db.query"]),
  write: new Set(["fs.write", "fs.remove", "fs.move"]),
});
const MAX_RESULT = 8 * 1024 * 1024; // characters of JSON
const MAX_PARALLEL = 6;

/* JSON with binary support (database BLOBs) */
export const encode = (v) =>
  JSON.stringify(v, (_k, x) => {
    if (x instanceof Uint8Array) return { __u8: btoa(String.fromCharCode(...x.subarray(0, 1 << 20))) };
    if (typeof x === "bigint") return { __big: x.toString() };
    return x;
  });
export const decode = (s) =>
  JSON.parse(s, (_k, x) => {
    if (x && typeof x === "object") {
      if (typeof x.__u8 === "string") return Uint8Array.from(atob(x.__u8), (c) => c.charCodeAt(0));
      if (typeof x.__big === "string") return BigInt(x.__big);
    }
    return x;
  });

export class RpcHost {
  constructor({ engine, send, canWrite = () => true, onWrite = () => {}, log = () => {} }) {
    this.onWrite = onWrite;
    this.engine = engine;
    this.send = send;
    this.canWrite = canWrite;
    this.log = log;
    this.busy = new Map();
  }
  async handle(from, msg) {
    const { id, m, a = [] } = msg;
    const fail = (e, code = "error") => this.send(from, { t: "rpc-res", id, ok: false, e: String(e?.message ?? e), code });
    if (typeof id !== "number" || typeof m !== "string") return;
    const isRead = ALLOWED.read.has(m), isWrite = ALLOWED.write.has(m);
    if (!isRead && !isWrite) return fail("Opération non autorisée pour les invités.", "denied");
    if (isWrite && !this.canWrite(from)) return fail("L’hôte n’autorise pas les modifications.", "readonly");
    const n = this.busy.get(from) ?? 0;
    if (n >= MAX_PARALLEL) return fail("L’hôte est occupé. Réessayez.", "busy");
    this.busy.set(from, n + 1);
    try {
      const [ns, fn] = m.split(".");
      const target = this.engine[ns];
      if (!target || typeof target[fn] !== "function") throw Error("Opération indisponible.");
      const value = await target[fn](...a);
      if (m === "fs.write") this.onWrite(a[0], a[1], from);
      const text = encode(value ?? null);
      if (text.length > MAX_RESULT) throw Error("Résultat trop volumineux pour un invité.");
      const parts = chunkText(text);
      parts.forEach((p, i) => this.send(from, { t: "rpc-res", id, ok: true, part: i, parts: parts.length, d: p }));
    } catch (e) {
      this.log("warn", "collab_rpc", { m, message: String(e?.message ?? e) });
      fail(e);
    } finally {
      this.busy.set(from, (this.busy.get(from) ?? 1) - 1);
    }
  }
}

export class RpcGuest {
  constructor({ send, timeoutMs = 25_000, onBusy = () => {} }) {
    this.send = send;
    this.timeoutMs = timeoutMs;
    this.onBusy = onBusy;
    this.next = 1;
    this.calls = new Map();
    this.pending = 0;
  }
  call(m, a = []) {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      const entry = { resolve, reject, parts: [], got: 0, m, a };
      entry.timer = setTimeout(() => this.#end(id, null, Error("L’hôte ne répond pas. Vérifiez qu’il est connecté.")), this.timeoutMs);
      this.calls.set(id, entry);
      this.onBusy(++this.pending);
      this.send({ t: "rpc", id, m, a });
    });
  }
  #end(id, value, error) {
    const c = this.calls.get(id);
    if (!c) return;
    clearTimeout(c.timer);
    this.calls.delete(id);
    this.onBusy(--this.pending);
    error ? c.reject(error) : c.resolve(value);
  }
  handle(msg) {
    const c = this.calls.get(msg.id);
    if (!c) return;
    if (!msg.ok) return this.#end(msg.id, null, Object.assign(Error(msg.e || "Erreur de l’hôte."), { code: msg.code }));
    c.parts[msg.part] = msg.d;
    c.got++;
    if (c.got < msg.parts) return;
    try { this.#end(msg.id, decode(c.parts.join("")), null); } catch (e) { this.#end(msg.id, null, e); }
  }
  /** After a reconnect the host may have lost our requests: replay the ones still waiting. */
  replay() {
    for (const [id, c] of this.calls) { c.parts = []; c.got = 0; this.send({ t: "rpc", id, m: c.m, a: c.a }); }
  }
}

/** Swap the guest's engine methods for remote ones. Returns a function that restores them. */
export function installGuestEngine(engine, rpc) {
  const saved = [];
  const wrap = (ns, name, impl) => {
    const target = engine[ns];
    if (!target) return;
    const desc = Object.getOwnPropertyDescriptor(target, name);
    saved.push([target, name, desc]);
    Object.defineProperty(target, name, { configurable: true, enumerable: true, ...(typeof impl === "function" ? { value: impl, writable: true } : impl) });
  };
  for (const m of [...ALLOWED.read, ...ALLOWED.write]) {
    const [ns, fn] = m.split(".");
    wrap(ns, fn, (...a) => rpc.call(m, a));
  }
  wrap("db", "ready", { get: () => true });
  wrap("db", "init", async () => {});
  return () => { for (const [t, n, d] of saved.reverse()) d ? Object.defineProperty(t, n, d) : delete t[n]; };
}
