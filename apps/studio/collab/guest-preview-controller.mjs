/** Guest-side bridge between a local Service Worker and a host-only PHP/SQL HTTP gateway. */
import { guestPreviewURL, validGuestChannel } from "./guest-preview-route.mjs";

export class GuestPreviewController {
  constructor({ request, cookie, online = () => true, serviceWorker = globalThis.navigator?.serviceWorker,
    channel = globalThis.crypto?.randomUUID?.().replaceAll("-", "") }) {
    if (!validGuestChannel(channel)) throw Error("Secure guest preview channel unavailable");
    this.channel = channel;
    this.request = request;
    this.cookie = cookie;
    this.online = online;
    this.serviceWorker = serviceWorker;
    this.active = false;
    this.onMessage = event => this.handle(event);
    this.onControllerChange = () => { if (this.active) this.#signal("pbl-guest-bind").catch(() => {}); };
  }
  url(path) { return guestPreviewURL(this.channel, path); }
  async #signal(type) {
    const worker = this.serviceWorker?.controller;
    if (!worker) throw Error("Service Worker indisponible pour l’aperçu invité.");
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timeout = setTimeout(() => { channel.port1.close(); reject(Error("Enregistrement de l’aperçu expiré.")); }, 10000);
      channel.port1.onmessage = ({ data }) => {
        clearTimeout(timeout); channel.port1.close();
        data?.ok ? resolve() : reject(Error(data?.error ?? "L’aperçu invité est indisponible."));
      };
      worker.postMessage({ type, channel: this.channel }, [channel.port2]);
    });
  }
  async start() {
    if (this.active) return;
    if (!this.serviceWorker) throw Error("Service Worker indisponible pour l’aperçu invité.");
    this.serviceWorker.addEventListener("message", this.onMessage);
    try { await this.#signal("pbl-guest-bind"); }
    catch (error) { this.serviceWorker.removeEventListener("message", this.onMessage); throw error; }
    this.active = true;
    this.serviceWorker.addEventListener("controllerchange", this.onControllerChange);
  }
  handle(event) {
    const { data } = event;
    if (!this.active || data?.channel !== this.channel || !["pbl-guest-route", "pbl-guest-cookie"].includes(data.type)) return false;
    const port = event.ports?.[0];
    if (!port) return true;
    if (!this.online()) { port.postMessage({ ok: false, error: "L’hôte est déconnecté. La requête HTTP n’a pas été exécutée." }); return true; }
    const result = data.type === "pbl-guest-route"
      ? Promise.resolve().then(() => this.request(data.request))
      : Promise.resolve().then(() => this.cookie(data.value, data.url));
    result.then(value => {
      const transfers = value?.body instanceof Uint8Array ? [value.body.buffer] : [];
      port.postMessage({ ok: true, value }, transfers);
    }, error => port.postMessage({ ok: false, error: String(error?.message ?? error) }));
    return true;
  }
  stop() {
    if (!this.active) return;
    this.active = false;
    this.serviceWorker.removeEventListener("message", this.onMessage);
    this.serviceWorker.removeEventListener("controllerchange", this.onControllerChange);
    this.#signal("pbl-guest-unbind").catch(() => {});
  }
}
