// ALWIS collaboration hub (server edition only).
// The server stores nothing: it pairs peers (signaling), keeps the seat table
// and, when WebRTC is impossible, relays small frames under a strict budget.
import { createHash, randomBytes } from "node:crypto";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export const COLLAB_DEFAULTS = Object.freeze({
  enabled: true,
  maxGuests: 6, // guests per room (the host is extra)
  graceMs: 45_000, // seat kept for a guest who lost the network
  hostGraceMs: 90_000, // room kept for a host who lost the network
  relayBytesPerSec: 192 * 1024, // per room, only used when P2P fails
  relayBurstBytes: 512 * 1024,
  messagesPerSec: 120, // per connection (burst x2)
  maxMessageBytes: 256 * 1024,
  maxRooms: 500,
  maxConnections: 2000,
  maxPerIp: 40,
  heartbeatMs: 15_000,
  handshakeMs: 10_000,
});

export function normalizeCollabConfig(input = {}) {
  const c = { ...COLLAB_DEFAULTS, ...input };
  const clamp = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, Math.trunc(+v))) : d);
  c.enabled = c.enabled !== false;
  c.maxGuests = clamp(c.maxGuests, 1, 12, COLLAB_DEFAULTS.maxGuests);
  c.graceMs = clamp(c.graceMs, 1_000, 600_000, COLLAB_DEFAULTS.graceMs);
  c.hostGraceMs = clamp(c.hostGraceMs, 1_000, 1_800_000, COLLAB_DEFAULTS.hostGraceMs);
  c.relayBytesPerSec = clamp(c.relayBytesPerSec, 1024, 16 * 1048576, COLLAB_DEFAULTS.relayBytesPerSec);
  c.relayBurstBytes = clamp(c.relayBurstBytes, 4096, 64 * 1048576, COLLAB_DEFAULTS.relayBurstBytes);
  c.messagesPerSec = clamp(c.messagesPerSec, 5, 5000, COLLAB_DEFAULTS.messagesPerSec);
  c.maxMessageBytes = clamp(c.maxMessageBytes, 1024, 4 * 1048576, COLLAB_DEFAULTS.maxMessageBytes);
  c.maxRooms = clamp(c.maxRooms, 1, 100_000, COLLAB_DEFAULTS.maxRooms);
  c.maxConnections = clamp(c.maxConnections, 1, 100_000, COLLAB_DEFAULTS.maxConnections);
  c.maxPerIp = clamp(c.maxPerIp, 1, 10_000, COLLAB_DEFAULTS.maxPerIp);
  c.heartbeatMs = clamp(c.heartbeatMs, 1_000, 120_000, COLLAB_DEFAULTS.heartbeatMs);
  c.handshakeMs = clamp(c.handshakeMs, 500, 60_000, COLLAB_DEFAULTS.handshakeMs);
  return c;
}

/* ---------- minimal RFC 6455 framing (text only, no extensions) ---------- */
export function encodeFrame(opcode, payload = Buffer.alloc(0)) {
  const len = payload.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | opcode, len]);
  else if (len < 65536) {
    head = Buffer.alloc(4);
    head[0] = 0x80 | opcode;
    head[1] = 126;
    head.writeUInt16BE(len, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = 0x80 | opcode;
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([head, payload]);
}

export class FrameParser {
  constructor({ maxMessageBytes, onText, onControl, onError }) {
    this.max = maxMessageBytes;
    this.onText = onText;
    this.onControl = onControl;
    this.onError = onError;
    this.buf = Buffer.alloc(0);
    this.parts = [];
    this.partBytes = 0;
    this.failed = false;
  }
  push(chunk) {
    if (this.failed) return;
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = !!(b0 & 0x80), opcode = b0 & 0x0f, masked = !!(b1 & 0x80);
      if (b0 & 0x70) return this.fail(1002, "rsv");
      if (!masked) return this.fail(1002, "unmasked");
      let len = b1 & 0x7f, offset = 2;
      if (len === 126) {
        if (this.buf.length < 4) return;
        len = this.buf.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) return;
        const big = this.buf.readBigUInt64BE(2);
        if (big > BigInt(this.max)) return this.fail(1009, "too big");
        len = Number(big);
        offset = 10;
      }
      const control = opcode >= 8;
      if (control && (!fin || len > 125)) return this.fail(1002, "control");
      if (len > this.max || this.partBytes + len > this.max) return this.fail(1009, "too big");
      if (this.buf.length < offset + 4 + len) return;
      const mask = this.buf.subarray(offset, offset + 4);
      const data = Buffer.from(this.buf.subarray(offset + 4, offset + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(offset + 4 + len);
      if (control) {
        this.onControl(opcode, data);
        continue;
      }
      if (opcode === 2) return this.fail(1003, "binary unsupported");
      if (opcode === 1) {
        if (this.parts.length) return this.fail(1002, "expected continuation");
      } else if (opcode === 0) {
        if (!this.parts.length) return this.fail(1002, "unexpected continuation");
      } else return this.fail(1002, "opcode");
      this.parts.push(data);
      this.partBytes += data.length;
      if (fin) {
        const text = Buffer.concat(this.parts).toString("utf8");
        this.parts = [];
        this.partBytes = 0;
        this.onText(text);
      }
    }
  }
  fail(code, reason) {
    this.failed = true;
    this.onError(code, reason);
  }
}

class Bucket {
  constructor(rate, burst, now) {
    this.rate = rate;
    this.burst = burst;
    this.tokens = burst;
    this.at = now();
    this.now = now;
  }
  take(n) {
    const t = this.now();
    this.tokens = Math.min(this.burst, this.tokens + ((t - this.at) / 1000) * this.rate);
    this.at = t;
    if (this.tokens < n) return Math.ceil(((n - this.tokens) / this.rate) * 1000);
    this.tokens -= n;
    return 0;
  }
}

const cleanName = (value) =>
  typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e]/g, "").replace(/\s+/g, " ").trim().slice(0, 32)
    : "";
const sid = (bytes = 12) => randomBytes(bytes).toString("base64url");
const makeCode = () => Array.from(randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join("");

export function createCollabHub({ getConfig = () => ({}), log = () => {}, now = Date.now, clientIp = (r) => r.socket.remoteAddress ?? "?", originOk = () => true } = {}) {
  const rooms = new Map(); // code -> room
  const conns = new Set();
  const perIp = new Map();
  const cfg = () => normalizeCollabConfig(getConfig());

  function accept(request, socket) {
    const key = request.headers["sec-websocket-key"];
    if (request.headers.upgrade?.toLowerCase() !== "websocket" || !key || request.headers["sec-websocket-version"] !== "13") {
      socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
      return false;
    }
    const acceptKey = createHash("sha1").update(key + GUID).digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acceptKey}\r\n\r\n`);
    return true;
  }

  function handleUpgrade(request, socket, head) {
    const config = cfg();
    const ip = clientIp(request);
    if (!config.enabled || !originOk(request)) {
      socket.end(`HTTP/1.1 ${config.enabled ? 403 : 404} ${config.enabled ? "Forbidden" : "Not Found"}\r\nConnection: close\r\n\r\n`);
      return;
    }
    if (conns.size >= config.maxConnections || (perIp.get(ip) ?? 0) >= config.maxPerIp) {
      socket.end("HTTP/1.1 429 Too Many Requests\r\nRetry-After: 10\r\nConnection: close\r\n\r\n");
      return;
    }
    if (!accept(request, socket)) return;
    socket.setNoDelay(true);
    const conn = new Conn(socket, ip, config);
    conns.add(conn);
    perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
    if (head?.length) conn.parser.push(head);
  }

  class Conn {
    constructor(socket, ip, config) {
      this.socket = socket;
      this.ip = ip;
      this.alive = true;
      this.closed = false;
      this.peer = null; // { room, id }
      this.msgBucket = new Bucket(config.messagesPerSec, config.messagesPerSec * 2, now);
      this.parser = new FrameParser({
        maxMessageBytes: config.maxMessageBytes,
        onText: (text) => this.onText(text),
        onControl: (op, data) => {
          if (op === 8) this.close(1000, "bye");
          else if (op === 9) this.write(encodeFrame(10, data));
          else if (op === 10) this.alive = true;
        },
        onError: (code, reason) => this.close(code, reason),
      });
      socket.on("data", (chunk) => this.parser.push(chunk));
      socket.on("close", () => this.dropped());
      socket.on("error", () => this.dropped());
      this.beat = setInterval(() => {
        if (!this.alive) return this.close(1001, "timeout");
        this.alive = false;
        this.write(encodeFrame(9));
      }, config.heartbeatMs);
      this.beat.unref();
      this.hs = setTimeout(() => !this.peer && this.close(1008, "handshake timeout"), config.handshakeMs);
      this.hs.unref();
    }
    write(buf) {
      if (this.closed || this.socket.destroyed) return false;
      if (this.socket.writableLength > 4 * 1048576) {
        this.close(1013, "slow consumer");
        return false;
      }
      this.socket.write(buf);
      return true;
    }
    send(obj) {
      return this.write(encodeFrame(1, Buffer.from(JSON.stringify(obj))));
    }
    close(code = 1000, reason = "") {
      if (this.closed) return;
      const r = Buffer.from(reason).subarray(0, 100);
      const payload = Buffer.alloc(2 + r.length);
      payload.writeUInt16BE(code, 0);
      r.copy(payload, 2);
      try {
        this.socket.write(encodeFrame(8, payload));
        this.socket.end();
      } catch {}
      setTimeout(() => this.socket.destroy(), 1000).unref();
      this.dropped();
    }
    dropped() {
      if (this.closed) return;
      this.closed = true;
      clearInterval(this.beat);
      clearTimeout(this.hs);
      conns.delete(this);
      const n = (perIp.get(this.ip) ?? 1) - 1;
      if (n <= 0) perIp.delete(this.ip);
      else perIp.set(this.ip, n);
      if (this.peer) onDisconnect(this);
    }
    onText(text) {
      const wait = this.msgBucket.take(1);
      if (wait) return this.send({ t: "throttle", retryMs: wait });
      let msg;
      try {
        msg = JSON.parse(text);
      } catch {
        return this.send({ t: "error", code: "bad-json" });
      }
      if (!msg || typeof msg !== "object" || typeof msg.t !== "string") return this.send({ t: "error", code: "bad-request" });
      try {
        dispatch(this, msg, text.length);
      } catch (error) {
        log("error", "collab_dispatch", { message: String(error?.message ?? error) });
        this.send({ t: "error", code: "internal" });
      }
    }
  }

  /* ---------- rooms ---------- */
  const limitsFor = (config) => ({
    maxGuests: config.maxGuests,
    graceMs: config.graceMs,
    hostGraceMs: config.hostGraceMs,
    relayBytesPerSec: config.relayBytesPerSec,
    maxMessageBytes: config.maxMessageBytes,
  });

  function variantFor(room, name, except) {
    const used = new Set();
    const key = name.toLowerCase();
    for (const p of allPeers(room)) if (p.id !== except && p.name.toLowerCase() === key) used.add(p.variant);
    let v = 0;
    while (used.has(v)) v++;
    return v;
  }
  const allPeers = (room) => [room.host, ...room.seats.values()];
  function roster(room) {
    return {
      t: "roster",
      hostState: room.host.conn ? "online" : "away",
      locked: room.locked,
      peers: allPeers(room).map((p) => ({
        id: p.id,
        role: p.id === "h" ? "host" : "guest",
        name: p.name,
        variant: p.variant,
        state: p.conn ? "online" : "away",
        awayUntil: p.conn ? 0 : p.awayUntil,
      })),
      max: room.config.maxGuests,
    };
  }
  function broadcast(room, obj, except) {
    for (const p of allPeers(room)) if (p.conn && p.id !== except) p.conn.send(obj);
  }
  const pushRoster = (room) => broadcast(room, roster(room));

  function closeRoom(room, reason) {
    if (!rooms.delete(room.code)) return;
    clearTimeout(room.host.timer);
    for (const p of allPeers(room)) {
      clearTimeout(p.timer);
      if (p.conn) {
        p.conn.peer = null;
        p.conn.send({ t: "closing", reason });
        p.conn.close(1000, reason);
      }
    }
    room.seats.clear();
    log("info", "collab_room_closed", { room: room.code, reason });
  }

  function dispatch(conn, msg, size) {
    switch (msg.t) {
      case "host": return onHost(conn, msg);
      case "join": return onJoin(conn, msg);
      case "ping": return conn.send({ t: "pong", at: msg.at ?? 0 });
    }
    if (!conn.peer) return conn.send({ t: "error", code: "not-joined" });
    const { room, id } = conn.peer;
    const me = id === "h" ? room.host : room.seats.get(id);
    if (!me || me.conn !== conn) return conn.send({ t: "error", code: "stale" });
    switch (msg.t) {
      case "sig":
      case "relay": return forward(room, me, msg, size, conn);
      case "leave":
        if (id === "h") return closeRoom(room, "host-left");
        return removeSeat(room, id, "left");
      case "kick": {
        if (id !== "h") return conn.send({ t: "error", code: "forbidden" });
        const seat = room.seats.get(String(msg.id));
        if (!seat) return conn.send({ t: "error", code: "no-peer" });
        seat.conn?.send({ t: "kicked" });
        removeSeat(room, seat.id, "kicked");
        return;
      }
      case "lock": {
        if (id !== "h") return conn.send({ t: "error", code: "forbidden" });
        room.locked = !!msg.locked;
        return pushRoster(room);
      }
      case "rename": {
        const name = cleanName(msg.name);
        if (!name) return conn.send({ t: "error", code: "name-invalid" });
        me.name = name;
        me.variant = variantFor(room, name, me.id);
        return pushRoster(room);
      }
      default: return conn.send({ t: "error", code: "unknown-type" });
    }
  }

  function forward(room, me, msg, size, conn) {
    const to = String(msg.to ?? "");
    if (me.id !== "h" && to !== "h") return conn.send({ t: "error", code: "star-only" }); // guests talk to the host only
    const target = to === "h" ? room.host : room.seats.get(to);
    if (!target?.conn) return conn.send({ t: "undelivered", to, ref: msg.ref ?? null });
    if (msg.t === "relay") {
      const key = typeof msg.ref === "string" && msg.ref.length <= 100 ? me.id + ":" + msg.ref : null;
      if (key && room.relaySeen.has(key)) return conn.send({ t: "relay-ack", ref: msg.ref });
      const wait = room.bucket.take(size);
      if (wait) return conn.send({ t: "throttle", retryMs: wait, ref: msg.ref ?? null });
    } else if (size > 16 * 1024) return conn.send({ t: "error", code: "sig-too-big" });
    target.conn.send({ t: msg.t, from: me.id, d: msg.d, ref: msg.ref });
    if (msg.t === "relay" && typeof msg.ref === "string" && msg.ref.length <= 100) {
      if (room.relaySeen.size >= 1024) room.relaySeen.delete(room.relaySeen.keys().next().value);
      room.relaySeen.set(me.id + ":" + msg.ref, true);
      conn.send({ t: "relay-ack", ref: msg.ref });
    }
  }

  function onHost(conn, msg) {
    const config = cfg();
    if (conn.peer) return conn.send({ t: "error", code: "already-joined" });
    const name = cleanName(msg.name);
    if (!name) return conn.send({ t: "error", code: "name-invalid" });
    // Resume an existing room with its secret key.
    if (msg.room && msg.hostKey) {
      const room = rooms.get(String(msg.room));
      if (!room || room.hostKey !== msg.hostKey) return conn.send({ t: "error", code: "no-room" });
      const prev = room.host.conn;
      clearTimeout(room.host.timer);
      room.host.conn = conn;
      conn.peer = { room, id: "h" };
      if (prev && prev !== conn) {
        prev.peer = null;
        prev.send({ t: "closing", reason: "replaced" });
        prev.close(4001, "replaced");
      }
      conn.send({ t: "hosted", room: room.code, hostKey: room.hostKey, id: "h", resumed: true, limits: limitsFor(room.config) });
      pushRoster(room);
      return;
    }
    if (rooms.size >= config.maxRooms) return conn.send({ t: "error", code: "server-full" });
    let code;
    do code = makeCode();
    while (rooms.has(code));
    const room = {
      code,
      hostKey: sid(18),
      config,
      locked: false,
      created: now(),
      nextSeat: 1,
      bucket: new Bucket(config.relayBytesPerSec, config.relayBurstBytes, now),
      host: { id: "h", name, variant: 0, conn, timer: null, awayUntil: 0 },
      seats: new Map(),
      relaySeen: new Map(),
      byToken: new Map(),
    };
    rooms.set(code, room);
    conn.peer = { room, id: "h" };
    conn.send({ t: "hosted", room: code, hostKey: room.hostKey, id: "h", resumed: false, limits: limitsFor(config) });
    pushRoster(room);
    log("info", "collab_room_opened", { room: code });
  }

  function onJoin(conn, msg) {
    if (conn.peer) return conn.send({ t: "error", code: "already-joined" });
    const room = rooms.get(String(msg.room ?? "").toUpperCase());
    if (!room) return conn.send({ t: "error", code: "no-room" });
    const name = cleanName(msg.name);
    if (!name) return conn.send({ t: "error", code: "name-invalid" });
    let seat = msg.resume ? room.byToken.get(String(msg.resume)) : null;
    const resumed = !!seat;
    if (seat) {
      // Same person coming back: keep the seat even if the room is full or locked.
      clearTimeout(seat.timer);
      const prev = seat.conn;
      seat.conn = conn;
      seat.awayUntil = 0;
      if (name !== seat.name) {
        seat.name = name;
        seat.variant = variantFor(room, name, seat.id);
      }
      if (prev && prev !== conn) {
        prev.peer = null;
        prev.send({ t: "closing", reason: "replaced" });
        prev.close(4001, "replaced");
      }
    } else {
      if (room.locked) return conn.send({ t: "error", code: "locked" });
      if (room.seats.size >= room.config.maxGuests) return conn.send({ t: "error", code: "full", max: room.config.maxGuests });
      const id = "g" + room.nextSeat++;
      seat = { id, name, variant: variantFor(room, name, id), conn, timer: null, awayUntil: 0, token: sid(18) };
      room.seats.set(id, seat);
      room.byToken.set(seat.token, seat);
    }
    conn.peer = { room, id: seat.id };
    conn.send({ t: "joined", room: room.code, id: seat.id, resume: seat.token, resumed, hostName: room.host.name, limits: limitsFor(room.config) });
    pushRoster(room);
    room.host.conn?.send({ t: "peer-up", id: seat.id, resumed });
  }

  function removeSeat(room, id, reason) {
    const seat = room.seats.get(id);
    if (!seat) return;
    clearTimeout(seat.timer);
    room.seats.delete(id);
    room.byToken.delete(seat.token);
    if (seat.conn) {
      seat.conn.peer = null;
      if (reason !== "left") seat.conn.close(1000, reason);
    }
    room.host.conn?.send({ t: "peer-down", id, reason });
    pushRoster(room);
  }

  function onDisconnect(conn) {
    const { room, id } = conn.peer;
    conn.peer = null;
    if (!rooms.has(room.code)) return;
    if (id === "h") {
      if (room.host.conn !== conn) return;
      room.host.conn = null;
      room.host.awayUntil = now() + room.config.hostGraceMs;
      room.host.timer = setTimeout(() => closeRoom(room, "host-timeout"), room.config.hostGraceMs);
      room.host.timer.unref();
      return pushRoster(room);
    }
    const seat = room.seats.get(id);
    if (!seat || seat.conn !== conn) return;
    seat.conn = null;
    seat.awayUntil = now() + room.config.graceMs;
    seat.timer = setTimeout(() => removeSeat(room, id, "grace-expired"), room.config.graceMs);
    seat.timer.unref();
    room.host.conn?.send({ t: "peer-away", id, until: seat.awayUntil });
    pushRoster(room);
  }

  return {
    handleUpgrade,
    stats: () => {
      const activeRooms = [...rooms.values()];
      let guests = 0, onlineParticipants = 0, awayParticipants = 0, lockedRooms = 0;
      for (const room of activeRooms) {
        if (room.locked) lockedRooms++;
        if (room.host.conn) onlineParticipants++; else awayParticipants++;
        for (const seat of room.seats.values()) {
          guests++;
          if (seat.conn) onlineParticipants++; else awayParticipants++;
        }
      }
      return { rooms: activeRooms.length, connections: conns.size, guests, onlineParticipants, awayParticipants, lockedRooms };
    },
    publicConfig: () => {
      const c = cfg();
      return { enabled: c.enabled, maxGuests: c.maxGuests, graceMs: c.graceMs, hostGraceMs: c.hostGraceMs, relayBytesPerSec: c.relayBytesPerSec, relayBurstBytes: c.relayBurstBytes, maxMessageBytes: c.maxMessageBytes, messagesPerSec: c.messagesPerSec, maxRooms: c.maxRooms, maxConnections: c.maxConnections, maxPerIp: c.maxPerIp };
    },
    close() {
      for (const room of [...rooms.values()]) closeRoom(room, "server-stop");
      for (const conn of [...conns]) conn.close(1001, "server-stop");
    },
    _rooms: rooms,
  };
}
