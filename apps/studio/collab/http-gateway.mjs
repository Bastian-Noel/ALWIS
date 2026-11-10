/**
 * Guest/host HTTP RPC endpoints. They do not publish preview routes yet;
 * wiring them to a guest Service Worker requires per-guest origin isolation
 * and an explicit host opt-in. PHP and SQL remain host-side only.
 */
import {
  HTTP_LIMITS, GuestSessionRegistry, normalizeGuestRequest, normalizeHostResponse,
} from "./http-contract.mjs";
import { httpFrames, HttpFrameCollector } from "./http-frames.mjs";
import { HttpFrameFlow, frameNeedsAck } from "./http-flow.mjs";

export class HostHttpGateway {
  constructor({ origin, sessions, route, send, canPreview = () => false, log = () => {} }) {
    this.origin = origin;
    this.send = send;
    this.route = route;
    this.canPreview = canPreview;
    this.log = log;
    this.registry = new GuestSessionRegistry(sessions);
    this.collector = new HttpFrameCollector({ maxPending: 24 });
    this.flow = new HttpFrameFlow({ send: (to, frame) => this.send(to, frame) });
    this.active = new Map();
  }
  async receive(from, message) {
    if (message?.t === "http-ack") { this.flow.acknowledge(from, message); return true; }
    if (message?.t === "http-error") { this.flow.abort(from, "http-response", message.id); return true; }
    if (message?.t !== "http-request") return false;
    let request;
    try {
      request = this.collector.accept(from, message);
      if (frameNeedsAck(message)) this.send(from, { t: "http-ack", kind: "http-request", id: message.id, part: message.part });
    }
    catch (error) { this.send(from, { t: "http-error", id: message.id, error: String(error.message) }); return true; }
    if (!request) return true;
    const id = request.id, count = this.active.get(from) ?? 0;
    if (count >= HTTP_LIMITS.maxConcurrentPerGuest) {
      this.send(from, { t: "http-error", id, error: "Too many concurrent requests" });
      return true;
    }
    this.active.set(from, count + 1);
    try {
      if (!await this.canPreview(from)) throw Error("L'hôte n'autorise pas l'aperçu PHP interactif.");
      const { name: _name, ...metadata } = request.meta;
      const normalized = normalizeGuestRequest({ ...metadata, body: request.body }, this.origin);
      const session = await this.registry.getOrCreate(from, String(request.meta.name ?? "Invité"));
      const result = await this.route(session, normalized);
      let body = result.body;
      if (result.file) {
        if (result.file.size > HTTP_LIMITS.responseBytes) throw Error("HTTP file exceeds guest budget");
        body = new Uint8Array(await result.file.arrayBuffer());
      }
      const response = normalizeHostResponse({ ...result, body, file: undefined });
      await this.flow.transfer(from, httpFrames("http-response", id, { status: response.status, headers: response.headers }, response.body));
    } catch (error) {
      this.log("warn", "guest_http", { message: String(error.message) });
      this.send(from, { t: "http-error", id, error: String(error.message) });
    } finally {
      const current = (this.active.get(from) ?? 1) - 1;
      if (current) this.active.set(from, current);
      else this.active.delete(from);
    }
    return true;
  }
  async drop(from) { this.flow.drop(from); await this.registry.drop(from); }
  async close() { this.flow.close(); this.collector.reset(); await this.registry.close(); this.active.clear(); }
}

export class GuestHttpGateway {
  constructor({ send, timeoutMs = 120_000, origin, name = "Invité" }) {
    this.send = send;
    this.origin = origin;
    this.name = name;
    this.timeoutMs = timeoutMs;
    this.collector = new HttpFrameCollector({ timeoutMs, maxPending: 4 });
    this.flow = new HttpFrameFlow({ send: (_peer, frame) => this.send(frame), timeoutMs });
    this.pending = new Map();
    this.nextId = 0;
  }
  async request(value) {
    if (this.pending.size >= HTTP_LIMITS.maxConcurrentPerGuest) throw Error("Too many concurrent guest HTTP requests");
    const normalized = normalizeGuestRequest(value, this.origin);
    const id = ++this.nextId;
    const meta = { url: normalized.url, method: normalized.method, headers: normalized.headers,
      destination: normalized.destination, name: this.name };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); this.flow.abort("host", "http-request", id); reject(Error("L'hôte n'a pas répondu à la requête HTTP.")); }, this.timeoutMs);
      timer.unref?.();
      this.pending.set(id, { resolve, reject, timer });
      this.flow.transfer("host", httpFrames("http-request", id, meta, normalized.body)).catch(error => {
        if (!this.pending.has(id)) return;
        clearTimeout(timer); this.pending.delete(id); reject(error);
      });
    });
  }
  receive(message) {
    if (message?.t === "http-ack") { this.flow.acknowledge("host", message); return true; }
    if (message?.t === "http-error") {
      this.flow.abort("host", "http-request", message.id);
      const pending = this.pending.get(message.id);
      if (pending) {
        clearTimeout(pending.timer); this.pending.delete(message.id);
        pending.reject(Error(String(message.error ?? "Remote HTTP request failed")));
      }
      return true;
    }
    if (message?.t !== "http-response" || !this.pending.has(message.id)) return false;
    let response;
    try {
      response = this.collector.accept("host", message);
      if (frameNeedsAck(message)) this.send({ t: "http-ack", kind: "http-response", id: message.id, part: message.part });
    }
    catch (error) {
      this.send({ t: "http-error", id: message.id, error: "Invalid HTTP response frame" });
      const pending = this.pending.get(message.id);
      clearTimeout(pending.timer); this.pending.delete(message.id); pending.reject(error);
      return true;
    }
    if (!response) return true;
    const pending = this.pending.get(response.id);
    clearTimeout(pending.timer); this.pending.delete(response.id);
    try { pending.resolve(normalizeHostResponse({ ...response.meta, body: response.body })); }
    catch (error) { pending.reject(error); }
    return true;
  }
  close() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(Error("L'aperçu distant a été déconnecté."));
    }
    this.pending.clear();
    this.flow.close();
    this.collector.reset();
  }
}
