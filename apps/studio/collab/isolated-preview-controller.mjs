/**
 * Trusted studio half of the dedicated-origin guest HTTP preview.
 * A third-party PHP site can execute script in its own distinct origin,
 * but cannot access the studio DOM, credentials or request handlers.
 */
import { guestPreviewURL, validGuestChannel } from "./guest-preview-route.mjs";

export function validatePreviewOrigin(value, studioOrigin) {
  if (typeof value !== "string" || !value) throw Error("Une origine d'aperçu dédiée est nécessaire.");
  const preview = new URL(value);
  const studio = new URL(studioOrigin);
  if (preview.origin !== value || preview.username || preview.password
      || preview.pathname !== "/" || preview.search || preview.hash
      || preview.origin === studio.origin) throw Error("L'aperçu doit avoir une origine distincte du studio.");
  if (preview.protocol !== "https:" &&
      !(preview.protocol === "http:" && (preview.hostname === "localhost" || preview.hostname.endsWith(".localhost") || ["127.0.0.1", "[::1]"].includes(preview.hostname))))
    throw Error("L'origine d'aperçu doit utiliser HTTPS (sauf localhost).");
  return preview.origin;
}

export function guestPreviewHostRequest(message, { channel, previewOrigin, studioOrigin }) {
  if (!message || typeof message.url !== "string") throw Error("Requête d'aperçu invalide.");
  const preview = new URL(message.url);
  if (preview.origin !== previewOrigin) throw Error("Origine d'aperçu incorrecte.");
  const prefix = "/__alwis-guest/" + channel;
  if (preview.pathname.startsWith("/__alwis-guest/") && !preview.pathname.startsWith(prefix + "/"))
    throw Error("Canal d'aperçu incorrect.");
  const path = preview.pathname.startsWith(prefix + "/")
    ? preview.pathname.slice(prefix.length) : preview.pathname;
  const url = new URL(path + preview.search, studioOrigin);
  return { ...message, url: url.href };
}

export class IsolatedGuestPreviewController {
  constructor({ origin, studioOrigin = globalThis.location?.origin, request, cookie,
    online = () => true, channel = globalThis.crypto?.randomUUID?.().replaceAll("-", ""),
    document = globalThis.document, window = globalThis.window, timeoutMs = 12000 }) {
    if (!validGuestChannel(channel)) throw Error("Canal d'aperçu sécurisé invalide.");
    this.origin = validatePreviewOrigin(origin, studioOrigin);
    this.previewOrigin = this.origin;
    this.studioOrigin = studioOrigin;
    this.channel = channel;
    this.request = request;
    this.cookie = cookie;
    this.online = online;
    this.document = document;
    this.window = window;
    this.timeoutMs = timeoutMs;
    this.active = false;
    this.starting = null;
    this.handleMessage = event => this.receive(event);
  }

  url(path) { return this.origin + guestPreviewURL(this.channel, path).replace("/__pbl-guest/", "/__alwis-guest/"); }

  start() {
    if (this.active) return Promise.resolve();
    if (this.starting) return this.starting;
    if (!this.document || !this.window) return Promise.reject(Error("Fenêtre d'aperçu indisponible."));
    this.starting = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
      this.broker = this.document.createElement("iframe");
      this.broker.hidden = true;
      this.broker.setAttribute("sandbox", "allow-scripts allow-same-origin");
      this.broker.setAttribute("aria-hidden", "true");
      this.broker.src = this.origin + "/guest-broker.html?channel=" + this.channel
        + "&studioOrigin=" + encodeURIComponent(this.studioOrigin);
      this.window.addEventListener("message", this.handleMessage);
      this.timer = setTimeout(() => {
        this.stop();
        reject(Error("L'aperçu sécurisé ne répond pas. Vérifiez son origine dédiée et sa configuration DNS/TLS."));
      }, this.timeoutMs);
      this.document.body.append(this.broker);
    });
    return this.starting;
  }

  receive(event) {
    const data = event.data;
    if (event.origin !== this.origin || event.source !== this.broker?.contentWindow
        || !data || data.channel !== this.channel) return false;
    if (data.type === "alwis-preview-ready") {
      clearTimeout(this.timer);
      this.active = true;
      this.resolveReady?.();
      this.starting = null;
      return true;
    }
    if (!["alwis-preview-http", "alwis-preview-cookie"].includes(data.type)) return false;
    const port = event.ports?.[0];
    if (!port) return true;
    if (!this.online() || !this.active) {
      port.postMessage({ ok: false, error: "Le navigateur hôte est déconnecté." });
      return true;
    }
    try {
      const task = data.type === "alwis-preview-http"
        ? this.request(guestPreviewHostRequest(data.request, this))
        : this.cookie(data.value, guestPreviewHostRequest({ url: data.url }, this).url);
      Promise.resolve(task).then(value => {
        const transfers = value?.body instanceof Uint8Array ? [value.body.buffer] : [];
        port.postMessage({ ok: true, response: value, value }, transfers);
      }, error => port.postMessage({ ok: false, error: String(error?.message ?? error) }));
    } catch (error) {
      port.postMessage({ ok: false, error: String(error?.message ?? error) });
    }
    return true;
  }

  stop() {
    clearTimeout(this.timer);
    this.active = false;
    this.starting = null;
    this.window?.removeEventListener("message", this.handleMessage);
    this.broker?.remove();
    this.broker = null;
    this.rejectReady?.(Error("Aperçu invité arrêté."));
    this.resolveReady = null;
    this.rejectReady = null;
  }
}
