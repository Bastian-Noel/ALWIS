// CollabSession: orchestrates signaling, per-peer links, roster, resume and status.
import { Emitter, Signaling, PeerLink } from "./transport.mjs";

const KEY = "alwis-collab-v1";
const store = {
  get() { try { return JSON.parse(sessionStorage.getItem(KEY) ?? "null"); } catch { return null; } },
  set(v) { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch {} },
  clear() { try { sessionStorage.removeItem(KEY); } catch {} },
};
const bootId = Math.random().toString(36).slice(2, 10);

export class CollabSession extends Emitter {
  /** Returns the server's collab config, or null on the static edition / when disabled. */
  static async probe(fetchImpl = globalThis.fetch) {
    try {
      const r = await fetchImpl("/api/collab/config", { cache: "no-store", credentials: "same-origin" });
      if (!r.ok) return null;
      const c = await r.json();
      return c?.enabled && c.path ? c : null;
    } catch { return null; }
  }
  constructor(config, { WebSocketImpl, RTC } = {}) {
    super();
    this.config = config;
    this.WS = WebSocketImpl;
    this.RTC = RTC;
    this.role = null; // "host" | "guest"
    this.room = null;
    this.me = null; // { id, name, variant }
    this.peers = []; // roster
    this.hostState = "online";
    this.status = "idle"; // idle | connecting | live | reconnecting | closed
    this.links = new Map();
    this.gen = 0;
    this.limits = null;
    this.locked = false;
  }
  get saved() { return store.get(); }
  get isHost() { return this.role === "host"; }
  peer(id) { return this.peers.find((p) => p.id === id); }
  #wsUrl() {
    const u = new URL(this.config.path, location.href);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    return u.href;
  }
  #setStatus(s, detail) {
    if (this.status === s && !detail) return;
    this.status = s;
    if (s === "closed") this.closedReason = detail;
    this.emit("status", s, detail);
  }
  #start(hello) {
    this.sig = new Signaling({ url: this.#wsUrl(), hello, WebSocketImpl: this.WS });
    this.sig.on("message", (m) => this.#onMessage(m));
    this.sig.on("state", (s) => {
      if (s === "reconnecting") this.#setStatus("reconnecting");
      else if (s === "connecting") this.#setStatus("connecting");
    });
    this.sig.on("closed", (reason) => this.#setStatus("closed", reason));
    this.onlineHandler = () => this.sig?.nudge();
    this.visHandler = () => globalThis.document?.visibilityState === "visible" && this.sig?.nudge();
    globalThis.addEventListener?.("online", this.onlineHandler);
    globalThis.document?.addEventListener?.("visibilitychange", this.visHandler);
    this.sig.connect();
  }
  host(name) {
    this.role = "host";
    this.name = name;
    const saved = this.saved;
    const resume = saved?.role === "host" ? saved : null;
    this.#start(() => ({ t: "host", name: this.name, ...(resume ? { room: resume.room, hostKey: resume.hostKey } : {}) }));
  }
  join(room, name) {
    this.role = "guest";
    this.name = name;
    this.room = String(room).toUpperCase();
    const saved = this.saved;
    this.#start(() => {
      const s = this.saved;
      return { t: "join", room: this.room, name: this.name, ...(s?.role === "guest" && s.room === this.room ? { resume: s.resume } : {}) };
    });
  }
  #onMessage(m) {
    switch (m.t) {
      case "hosted":
        this.room = m.room;
        this.me = { id: "h", name: this.name, variant: 0 };
        this.limits = m.limits;
        store.set({ role: "host", room: m.room, hostKey: m.hostKey, name: this.name });
        this.#setStatus("live");
        this.emit("ready", { resumed: m.resumed });
        break;
      case "joined":
        this.me = { id: m.id, name: this.name, variant: 0 };
        this.limits = m.limits;
        store.set({ role: "guest", room: m.room, resume: m.resume, name: this.name });
        this.#setStatus("live");
        if (!this.links.has("h")) this.#makeLink("h", false, null);
        this.sig.send({ t: "sig", to: "h", d: { hi: bootId } });
        this.emit("ready", { resumed: m.resumed });
        break;
      case "roster": {
        const before = this.hostState;
        this.peers = m.peers;
        this.hostState = m.hostState;
        this.locked = m.locked;
        const mine = m.peers.find((p) => p.id === this.me?.id);
        if (mine) this.me = { ...this.me, variant: mine.variant };
        this.emit("roster", m);
        if (this.role === "guest" && before === "away" && m.hostState === "online") this.sig.send({ t: "sig", to: "h", d: { hi: bootId } });
        for (const link of this.links.values()) link.flushAfterResume();
        break;
      }
      case "peer-up": break; // the guest's `hi` drives link creation
      case "peer-away":
      case "peer-down":
        if (m.t === "peer-down") { this.links.get(m.id)?.close(); this.links.delete(m.id); }
        this.emit(m.t, m);
        break;
      case "sig": return this.#onSignal(m);
      case "relay": {
        const link = this.links.get(m.from);
        if (link) link.onRelay(m.d);
        break;
      }
      case "throttle": for (const l of this.links.values()) l.onThrottle(m.retryMs); break;
      case "undelivered": this.emit("undelivered", m); break;
      case "kicked":
        store.clear();
        this.#setStatus("closed", "kicked");
        this.sig?.close("kicked"); // Terminal: do not reconnect and rejoin a revoked seat.
        this.#teardown();
        break;
      case "closing":
        if (m.reason !== "replaced") store.clear();
        this.#setStatus("closed", m.reason);
        this.sig?.close(m.reason); // Closed room/host must never trigger a new join.
        this.#teardown();
        break;
      case "error":
        if (m.code === "no-room" && this.role === "host") {
          store.clear();
          this.#setStatus("closed", "no-room");
          this.sig?.close("no-room");
          this.#teardown();
        } else this.emit("error", m);
        if (["no-room", "full", "locked", "name-invalid", "server-full"].includes(m.code) && this.role === "guest") {
          this.#setStatus("closed", m.code);
          this.sig?.close(m.code); // Terminal join rejection: no zombie socket/retry.
          this.#teardown();
        }
        break;
    }
  }
  #makeLink(id, initiator, gen) {
    this.links.get(id)?.close();
    const link = new PeerLink({ signaling: this.sig, remoteId: id, initiator, gen, iceServers: this.config.iceServers ?? [], RTC: this.RTC });
    link.on("message", (msg) => this.emit("message", { from: id, msg }));
    link.on("mode", (mode) => this.emit("mode", { id, mode }));
    link.on("throttle", (ms) => this.emit("throttle", { id, ms }));
    this.links.set(id, link);
    this.emit("link", { id, link });
    return link;
  }
  #onSignal({ from, d }) {
    if (this.role === "host") {
      if (d.hi) {
        const cur = this.links.get(from);
        if (cur && cur.remoteBoot === d.hi && cur.mode === "p2p" && cur.dc?.readyState === "open") {
          this.sig.send({ t: "sig", to: from, d: { keep: cur.gen } });
          return;
        }
        const link = this.#makeLink(from, true, ++this.gen);
        link.remoteBoot = d.hi;
      } else this.links.get(from)?.onSignal(d);
      return;
    }
    // guest
    if (d.keep != null) return;
    let link = this.links.get("h");
    if (d.gen != null) {
      if (!link || (link.gen != null && link.gen !== d.gen)) link = this.#makeLink("h", false, d.gen);
      else link.gen = d.gen;
    }
    link?.onSignal(d);
  }
  send(to, obj, opts) { return this.links.get(to)?.send(obj, opts) ?? false; }
  /** Host -> every guest. */
  broadcast(obj, opts, except) {
    for (const [id, link] of this.links) if (id !== except) link.send(obj, opts);
  }
  kick(id) { this.sig?.send({ t: "kick", id }); }
  setLocked(v) { this.sig?.send({ t: "lock", locked: !!v }); }
  inviteUrl() {
    if (!this.room) return "";
    const u = new URL(location.href);
    u.hash = "";
    // Keep deployment selectors such as ?build=… or ?project=… so guests
    // open the same server edition and workspace route as the host.
    u.searchParams.delete("collab");
    u.searchParams.set("collab", this.room);
    return u.href;
  }
  #teardown() {
    for (const l of this.links.values()) l.close();
    this.links.clear();
    globalThis.removeEventListener?.("online", this.onlineHandler);
    globalThis.document?.removeEventListener?.("visibilitychange", this.visHandler);
  }
  leave() {
    store.clear();
    this.sig?.close("left");
    this.#teardown();
    this.peers = [];
    this.#setStatus("closed", "left");
  }
}
