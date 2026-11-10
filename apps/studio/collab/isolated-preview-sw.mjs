/**
 * Service Worker only for ALWIS's dedicated untrusted preview origin.
 * The studio's origin must NEVER register or serve this worker.
 * PHP/SQL, credentials and workspace files remain exclusively at the host.
 */
const peers = new Map();
const TOKEN = /^[a-f0-9]{32}$/;
const PREFIX = "/__alwis-guest/";

self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

function extract(url) {
  const route = new URL(url);
  const match = route.pathname.match(/^\/__alwis-guest\/([a-f0-9]{32})(\/.*)$/);
  return match ? { channel: match[1], path: match[2], search: route.search } : null;
}

async function findChannel(clientId) {
  if (!clientId) return null;
  const cached = peers.get(clientId);
  if (cached) return cached;
  const client = await self.clients.get(clientId);
  const parsed = client?.url && extract(client.url);
  if (parsed) {
    peers.set(clientId, parsed.channel);
    return parsed.channel;
  }
  return null;
}

async function publishCookies(channel, cookies) {
  if (!Array.isArray(cookies)) return;
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) {
    if (await findChannel(client.id) === channel) client.postMessage({
      type: "pbl-cookie-state", project: channel, session: channel, cookies,
    });
  }
}

async function proxy(channel, message) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const broker = windows.find(client => {
    const url = new URL(client.url);
    return url.pathname === "/guest-broker.html" && url.searchParams.get("channel") === channel;
  });
  if (!broker) throw Error("Aperçu : le relais invité est déconnecté.");
  return new Promise((resolve, reject) => {
    const ports = new MessageChannel();
    const timer = setTimeout(() => { ports.port1.close(); reject(Error("Le navigateur hôte ne répond pas.")); }, 15000);
    ports.port1.onmessage = ({ data }) => {
      clearTimeout(timer);
      ports.port1.close();
      if (data?.ok) resolve(data.response ?? data.value);
      else reject(Error(String(data?.error ?? "Échec HTTP distant")));
    };
    broker.postMessage({ ...message, channel }, [ports.port2]);
  });
}

self.addEventListener("message", event => {
  if (event.data?.type !== "pbl-cookie") return;
  event.waitUntil((async () => {
    try {
      const channel = await findChannel(event.source?.id);
      if (!channel || !TOKEN.test(channel)) throw Error("Requête de cookie hors aperçu.");
      const value = event.data.value, url = event.data.url;
      if (typeof value !== "string" || value.length > 4096 || /[\r\n\0]/.test(value)
          || typeof url !== "string" || new URL(url).origin !== self.location.origin)
        throw Error("Cookie invité invalide.");
      const cookies = await proxy(channel, { type: "alwis-preview-cookie", value, url });
      await publishCookies(channel, cookies);
      event.ports?.[0]?.postMessage({ ok: true, value: cookies });
    } catch (error) {
      event.ports?.[0]?.postMessage({ ok: false, error: String(error?.message ?? error) });
    }
  })());
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (["/guest-sw.js", "/guest-broker.html", "/guest-broker.mjs", "/_pbl/client.js"].includes(url.pathname)) return;
  const explicit = extract(url.href);
  event.respondWith((async () => {
    const channel = explicit?.channel ?? await findChannel(event.clientId);
    if (!channel || !TOKEN.test(channel)) return fetch(event.request);
    // On a full navigation the resultingClientId is a browser-issued identity,
    // not a guest-supplied session ID. After a SW restart, findChannel uses URL.
    if (event.resultingClientId) peers.set(event.resultingClientId, channel);
    const logical = new URL(event.request.url);
    if (explicit) logical.pathname = explicit.path;
    try {
      const body = ["GET", "HEAD"].includes(event.request.method)
        ? new Uint8Array() : new Uint8Array(await event.request.arrayBuffer());
      if (body.byteLength > 8 * 1024 * 1024) return new Response("Requête trop volumineuse", { status: 413 });
      const response = await proxy(channel, { type: "alwis-preview-http", request: {
        url: logical.href, method: event.request.method, destination: event.request.destination,
        headers: [...event.request.headers], body,
      } });
      const headers = new Headers(response.headers);
      headers.delete("Set-Cookie");
      headers.set("Cross-Origin-Resource-Policy", "cross-origin");
      headers.set("Cache-Control", "no-store");
      if (headers.has("Location")) {
        const value = headers.get("Location");
        const target = new URL(value, logical.href);
        if (target.origin === logical.origin) {
          const cleaned = target.pathname.replace(/^\/__pbl\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+(?=\/)/, "");
          headers.set("Location", PREFIX + channel + cleaned + target.search + target.hash);
        }
      }
      const empty = event.request.method === "HEAD" || [204, 205, 304].includes(response.status);
      let responseBody = empty ? null : response.body;
      if (!empty && response.status === 200 && ["document", "iframe"].includes(event.request.destination)
          && /text\/html/i.test(headers.get("Content-Type") ?? "")) {
        const config = JSON.stringify({
          project: channel, session: channel, prefix: PREFIX + channel + "/",
          logicalURL: logical.href, cookies: response.cookies ?? [],
        }).replace(/</g, "\\u003c");
        const bootstrap = '<script>window.__PBL_CONTEXT=' + config
          + ';</script><script src="/_pbl/client.js"></script>';
        const html = new TextDecoder().decode(response.body);
        responseBody = new TextEncoder().encode(/<head(?:\s[^>]*)?>/i.test(html)
          ? html.replace(/<head(?:\s[^>]*)?>/i, text => text + bootstrap) : bootstrap + html);
      }
      await publishCookies(channel, response.cookies);
      return new Response(responseBody, { status: response.status, headers });
    } catch (error) {
      return new Response(String(error?.message ?? error), {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cross-Origin-Resource-Policy": "cross-origin" },
      });
    }
  })());
});
