/**
 * Guest/host HTTP RPC endpoints. The host owns all PHP, SQL and cookie jars;
 * guests only transport browser requests after explicit host authorization.
 */
import {
  HTTP_LIMITS, GuestSessionRegistry, normalizeGuestRequest, normalizeHostResponse,
} from "./http-contract.mjs";
import { httpFrames, HttpFrameCollector } from "./http-frames.mjs";
import { HttpFrameFlow, frameNeedsAck } from "./http-flow.mjs";

export class HostHttpGateway {
  constructor({ origin, sessions, route, send, canPreview = () => false,
    cookieState = () => [], setCookie = () => { throw Error("Guest cookies not configured"); }, log = () => {} }) {
    this.origin = origin;
    this.send = send;
    this.route = route;
    this.canPreview = canPreview;
    this.cookieState = cookieState;
    this.setCookie = setCookie;
    this.log = log;
    this.registry = new GuestSessionRegistry(sessions);
    this.collector = new HttpFrameCollector({ maxPending: 24 });
    this.flow = new HttpFrameFlow({ send: (to, frame) => this.send(to, frame) });
    this.active = new Map();
  }
  async receive(from, message) {
    if (message?.t === "http-ack") { this.flow.acknowledge(from, message); return true; }
    if (message?.t === "http-error") { this.flow.abort(from, "http-response", message.id); return true; }
    if (message?.t === "http-cookie") {
      if (!Number.isSafeInteger(message.id) || message.id < 1) return true;
      const count = this.active.get(from) ?? 0;
      if (count >= HTTP_LIMITS.maxConcurrentPerGuest) {
        this.send(from, { t: "http-cookie-result", id: message.id, error: "Too many concurrent requests" });
        return true;
      }
      this.active.set(from, count + 1);
      try {
        if (!await this.canPreview(from)) throw Error("L'hôte n'autorise pas l'aperçu PHP interactif.");
        const url = normalizeGuestRequest({ url: message.url, method: "GET" }, this.origin).url;
        if (typeof message.value !== "string" || message.value.length > 4096 || /[\r\n\0]/.test(message.value))
          throw Error("Invalid guest cookie");
        const session = await this.registry.getOrCreate(from);
        await this.setCookie(session, message.value, url);
        this.send(from, { t: "http-cookie-result", id: message.id, cookies: this.#publicCookies(session) });
      } catch (error) {
        this.send(from, { t: "http-cookie-result", id: message.id, error: String(error.message) });
      } finally {
        const active = (this.active.get(from) ?? 1) - 1;
        if (active) this.active.set(from, active); else this.active.delete(from);
      }
      return true;
    }
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
      // A guest may lose the interactive-preview grant while PHP/SQL is
      // executing. Never return its result after a mid-request revocation.
      if (!await this.canPreview(from))
        throw Error("L'hôte a retiré l'autorisation d'aperçu PHP interactif.");
      const response = normalizeHostResponse({ ...result, body, file: undefined });
      await this.flow.transfer(from, httpFrames("http-response", id,
        { status: response.status, headers: response.headers, cookies: this.#publicCookies(session) }, response.body));
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
  #publicCookies(session) {
    const cookies = this.cookieState(session);
    if (!Array.isArray(cookies)) return [];
    // Defense in depth: even if an upstream sessions.list() accidentally
    // returns all cookies, HttpOnly values can NEVER be exposed to guest JS.
    const visible = cookies.filter(item => item && typeof item.name === "string"
      && typeof item.value === "string" && item.httpOnly !== true);
    // A frame must remain under the relay's 12 KiB budget, including metadata.
    return JSON.stringify(visible).length <= 4096 ? visible : [];
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
    this.pendingCookies = new Map();
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
  cookie(value, url) {
    const normalized = normalizeGuestRequest({ url, method: "GET" }, this.origin);
    if (typeof value !== "string" || value.length > 4096 || /[\r\n\0]/.test(value))
      return Promise.reject(Error("Invalid guest cookie"));
    if (this.pendingCookies.size >= HTTP_LIMITS.maxConcurrentPerGuest)
      return Promise.reject(Error("Too many pending guest cookie updates"));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCookies.delete(id); reject(Error("L'hôte ne répond pas à la mise à jour du cookie."));
      }, this.timeoutMs);
      timer.unref?.();
      this.pendingCookies.set(id, { resolve, reject, timer });
      if (this.send({ t: "http-cookie", id, url: normalized.url, value }) === false) {
        clearTimeout(timer); this.pendingCookies.delete(id); reject(Error("L'hôte est déconnecté."));
      }
    });
  }
  receive(message) {
    if (message?.t === "http-cookie-result") {
      const pending = this.pendingCookies.get(message.id);
      if (pending) {
        clearTimeout(pending.timer); this.pendingCookies.delete(message.id);
        message.error ? pending.reject(Error(String(message.error))) : pending.resolve(message.cookies ?? []);
      }
      return true;
    }
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
    try { pending.resolve({ ...normalizeHostResponse({ ...response.meta, body: response.body }), cookies: response.meta.cookies ?? [] }); }
    catch (error) { pending.reject(error); }
    return true;
  }
  close() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(Error("L'aperçu distant a été déconnecté."));
    }
    this.pending.clear();
    for (const pending of this.pendingCookies.values()) {
      clearTimeout(pending.timer);
      pending.reject(Error("L'aperçu distant a été déconnecté."));
    }
    this.pendingCookies.clear();
    this.flow.close();
    this.collector.reset();
  }
}
