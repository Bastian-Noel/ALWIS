// Transport: one signaling WebSocket (always), plus a WebRTC data channel when
// possible. If WebRTC cannot be established quickly the link silently uses the
// server relay (budgeted). The session layer only sees `link.send(obj)`.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Emitter {
  #h = new Map();
  on(type, fn) {
    (this.#h.get(type) ?? this.#h.set(type, new Set()).get(type)).add(fn);
    return () => this.#h.get(type)?.delete(fn);
  }
  emit(type, ...args) {
    for (const fn of [...(this.#h.get(type) ?? [])]) {
      try { fn(...args); } catch (e) { console.error("[collab]", e); }
    }
  }
}

/** Reconnecting signaling client. `hello()` returns the first message after each (re)connect. */
export class Signaling extends Emitter {
  constructor({ url, hello, WebSocketImpl = globalThis.WebSocket, maxBackoff = 8000 }) {
    super();
    this.url = url;
    this.hello = hello;
    this.WS = WebSocketImpl;
    this.maxBackoff = maxBackoff;
    this.state = "idle"; // idle | connecting | open | reconnecting | closed
    this.attempt = 0;
    this.ws = null;
    this.queue = [];
    this.lastSeen = 0;
  }
  connect() {
    if (this.state === "closed") return;
    this.state = this.attempt ? "reconnecting" : "connecting";
    this.emit("state", this.state);
    let ws;
    try { ws = new this.WS(this.url); } catch { return this.#retry(); }
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      ws.send(JSON.stringify(this.hello()));
    };
    ws.onmessage = (ev) => {
      this.lastSeen = Date.now();
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.t === "hosted" || msg.t === "joined") {
        this.state = "open";
        this.emit("state", "open");
        for (const m of this.queue.splice(0)) ws.send(m);
        this.#startPing();
      }
      this.emit("message", msg);
    };
    ws.onclose = (ev) => {
      this.#stopPing();
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.state === "closed" || ev.code === 4001 || ev.code === 1008) {
        // 4001 = replaced by another tab of the same person; do not fight for the seat.
        if (this.state !== "closed") this.close(ev.code === 4001 ? "replaced" : "refused");
        return;
      }
      this.emit("down", ev.code);
      this.#retry();
    };
    ws.onerror = () => {};
  }
  #retry() {
    if (this.state === "closed") return;
    this.attempt++;
    this.state = "reconnecting";
    this.emit("state", "reconnecting");
    const base = Math.min(this.maxBackoff, 400 * 2 ** Math.min(this.attempt - 1, 5));
    const delay = base / 2 + Math.random() * (base / 2); // jitter
    this.retryTimer = setTimeout(() => this.connect(), delay);
    this.emit("retry", { attempt: this.attempt, delay });
  }
  #startPing() {
    this.#stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === 1) {
        if (Date.now() - this.lastSeen > 40_000) return this.ws.close(); // half-dead: force reconnect
        this.ws.send('{"t":"ping"}');
      }
    }, 20_000);
  }
  #stopPing() { clearInterval(this.pingTimer); }
  /** Reconnect now (e.g. browser "online" event, tab becomes visible). */
  nudge() {
    if (this.state === "reconnecting") { clearTimeout(this.retryTimer); this.connect(); }
    else if (this.state === "open" && this.ws?.readyState !== 1) this.ws?.close();
  }
  send(obj) {
    const text = JSON.stringify(obj);
    if (this.ws?.readyState === 1 && this.state === "open") { this.ws.send(text); return true; }
    if (obj.t === "sig" || obj.t === "relay") return false; // stale: callers resend after resume
    this.queue.push(text);
    return true;
  }
  close(reason = "closed") {
    if (this.state === "closed") return;
    this.state = "closed";
    clearTimeout(this.retryTimer);
    this.#stopPing();
    try { this.ws?.send('{"t":"leave"}'); } catch {}
    try { this.ws?.close(1000); } catch {}
    this.ws = null;
    this.emit("state", "closed");
    this.emit("closed", reason);
  }
}

/** A logical link between this browser and one remote peer. */
export class PeerLink extends Emitter {
  constructor({ signaling, remoteId, initiator, gen = null, iceServers = [], p2pTimeoutMs = 3500, RTC = globalThis.RTCPeerConnection }) {
    super();
    this.sig = signaling;
    this.remote = remoteId;
    this.gen = gen;
    this.initiator = initiator;
    this.iceServers = iceServers;
    this.RTC = RTC;
    this.mode = "relay"; // "p2p" | "relay"
    this.dc = null;
    this.pc = null;
    this.throttledUntil = 0;
    this.outbox = [];
    this.closed = false;
    this.stats = { p2pBytes: 0, relayBytes: 0 };
    this.p2pTimeoutMs = p2pTimeoutMs;
    this.negotiating = !!RTC; // hold messages while WebRTC negotiates; relay only on failure
    this.#startP2P();
  }
  get usable() { return this.mode === "p2p" || this.sig.state === "open"; }
  #startP2P() {
    if (!this.RTC) return this.emit("mode", "relay");
    try {
      const pc = (this.pc = new this.RTC({ iceServers: this.iceServers }));
      pc.onicecandidate = (e) => e.candidate && this.#sig({ ice: e.candidate });
      pc.onconnectionstatechange = () => {
        if (["failed", "closed"].includes(pc.connectionState)) this.#toRelay();
        else if (pc.connectionState === "disconnected") setTimeout(() => pc.connectionState === "disconnected" && this.#toRelay(), 3000);
      };
      if (this.initiator) this.#bindChannel(pc.createDataChannel("alwis", { ordered: true }));
      else pc.ondatachannel = (e) => this.#bindChannel(e.channel);
      this.p2pTimer = setTimeout(() => this.mode !== "p2p" && this.#toRelay(), this.p2pTimeoutMs);
      if (this.initiator) this.#offer();
    } catch { this.#toRelay(); }
  }
  #sig(d) { this.sig.send({ t: "sig", to: this.remote, d: this.gen == null ? d : { ...d, gen: this.gen } }); }
  async #offer() {
    try {
      const o = await this.pc.createOffer();
      await this.pc.setLocalDescription(o);
      this.#sig({ sdp: this.pc.localDescription });
    } catch { this.#toRelay(); }
  }
  /** Feed a `sig` message coming from the remote peer. */
  async onSignal(d) {
    if (!this.pc || this.closed) return;
    try {
      if (d.sdp) {
        await this.pc.setRemoteDescription(d.sdp);
        if (d.sdp.type === "offer") {
          const a = await this.pc.createAnswer();
          await this.pc.setLocalDescription(a);
          this.#sig({ sdp: this.pc.localDescription });
        }
      } else if (d.ice) await this.pc.addIceCandidate(d.ice);
    } catch { this.#toRelay(); }
  }
  #bindChannel(dc) {
    this.dc = dc;
    dc.onopen = () => {
      clearTimeout(this.p2pTimer);
      this.negotiating = false;
      this.mode = "p2p";
      this.emit("mode", "p2p");
      this.#drain();
    };
    dc.onclose = () => this.#toRelay();
    dc.onmessage = (e) => {
      this.stats.p2pBytes += e.data.length;
      try { this.emit("message", JSON.parse(e.data)); } catch {}
    };
  }
  #toRelay() {
    if (this.closed) return;
    clearTimeout(this.p2pTimer);
    this.negotiating = false;
    if (this.mode !== "relay") { this.mode = "relay"; this.emit("mode", "relay"); }
    else if (!this.announcedRelay) { this.announcedRelay = true; this.emit("mode", "relay"); }
    try { this.pc?.close(); } catch {}
    this.pc = null;
    this.dc = null;
    this.#drain();
  }
  /** Relay frames come through here (called by the session). */
  onRelay(d) {
    this.stats.relayBytes += JSON.stringify(d).length;
    this.emit("message", d);
  }
  onThrottle(retryMs) {
    this.throttledUntil = Date.now() + retryMs;
    setTimeout(() => this.#drain(), retryMs + 5);
    this.emit("throttle", retryMs);
  }
  /**
   * Priority rules on the relay (budgeted by the server):
   *  - `key`: latest wins (cursors, pointer, viewport never pile up while throttled)
   *  - `group`: bulk transfer (file chunks, preview snapshot); a newer group id replaces older queued chunks
   *  - everything else keeps its order and goes before bulk data
   */
  send(obj, { droppable = false, key = null, group = null } = {}) {
    if (this.closed) return false;
    if (this.mode === "p2p" && this.dc?.readyState === "open") {
      if (this.dc.bufferedAmount > (group ? 400_000 : 1_000_000) && (droppable || group || key)) return false;
      const text = JSON.stringify(obj);
      this.stats.p2pBytes += text.length;
      this.dc.send(text);
      return true;
    }
    if (droppable && Date.now() < this.throttledUntil && !key) return false;
    const entry = { o: obj, key, group };
    if (key) {
      const i = this.outbox.findIndex((e) => e.key === key);
      if (i >= 0) { this.outbox[i] = entry; this.#drain(); return true; }
    }
    if (group) this.outbox = this.outbox.filter((e) => !(e.group === group && e.o.id !== obj.id));
    if (this.outbox.length > 400) this.outbox = this.outbox.filter((e) => !e.key && !e.group).slice(-200);
    this.outbox.push(entry);
    this.#drain();
    return true;
  }
  #drain() {
    if (this.closed) return;
    if (this.mode === "p2p" && this.dc?.readyState === "open") {
      for (const e of this.outbox.splice(0)) this.send(e.o, { key: e.key, group: e.group });
      return;
    }
    if (this.negotiating) return; // P2P negotiating: hold briefly (bounded by p2pTimeoutMs)
    if (Date.now() < this.throttledUntil) return;
    while (this.outbox.length) {
      let i = this.outbox.findIndex((e) => !e.group); // interactive traffic first, bulk after
      if (i < 0) i = 0;
      if (!this.sig.send({ t: "relay", to: this.remote, d: this.outbox[i].o })) return; // offline: keep for after resume
      this.outbox.splice(i, 1);
      this.stats.relayBytes += 100;
    }
  }
  flushAfterResume() { this.#drain(); }
  close() {
    this.closed = true;
    clearTimeout(this.p2pTimer);
    try { this.dc?.close(); } catch {}
    try { this.pc?.close(); } catch {}
    this.outbox.length = 0;
  }
}
export { sleep };
