/**
 * Prototype Service Worker for a dedicated untrusted preview origin.
 * This MUST NOT be registered on the studio origin: guest PHP pages can
 * execute arbitrary scripts, so origin separation is a security requirement.
 */
const peers = new Map();
const TOKEN = /^[a-f0-9]{32}$/;

self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

function extract(url) {
  const route = new URL(url);
  const match = route.pathname.match(/^\/__alwis-guest\/([a-f0-9]{32})(\/.*)$/);
  return match ? { channel: match[1], path: match[2], search: route.search } : null;
}

async function proxy(channel, request) {
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
      if (data?.ok) resolve(data.response);
      else reject(Error(String(data?.error ?? "Échec HTTP distant")));
    };
    broker.postMessage({ type: "alwis-preview-http", channel, request }, [ports.port2]);
  });
}
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const explicit = extract(url.href);
  const channel = explicit?.channel ?? peers.get(event.clientId);
  if (!channel || !TOKEN.test(channel)) return;
  // The main navigation sets its resulting client's identity before resources load.
  event.respondWith((async () => {
    if (event.resultingClientId) peers.set(event.resultingClientId, channel);
    const logical = new URL(event.request.url);
    if (explicit) logical.pathname = explicit.path;
    try {
      const body = ["GET", "HEAD"].includes(event.request.method)
        ? new Uint8Array() : new Uint8Array(await event.request.arrayBuffer());
      if (body.byteLength > 8 * 1024 * 1024) return new Response("Requête trop volumineuse", { status: 413 });
      const response = await proxy(channel, {
        url: logical.href,
        method: event.request.method,
        destination: event.request.destination,
        headers: [...event.request.headers],
        body,
      });
      const headers = new Headers(response.headers);
      headers.set("Cross-Origin-Resource-Policy", "cross-origin");
      headers.set("Cache-Control", "no-store");
      const empty = event.request.method === "HEAD" || [204, 205, 304].includes(response.status);
      return new Response(empty ? null : response.body, { status: response.status, headers });
    } catch (error) {
      return new Response(String(error?.message ?? error), {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cross-Origin-Resource-Policy": "cross-origin" },
      });
    }
  })());
});
