// Route preview clients to the live studio owner. The Service Worker never owns SQL.
const owners = new Map();
const database = new Promise((resolve, reject) => {
  const request = indexedDB.open('pbl-client-bindings', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('clients');
  request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
});
async function binding(id, value) {
  if (!id) return undefined;
  const db = await database;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('clients', value ? 'readwrite' : 'readonly');
    const request = value ? transaction.objectStore('clients').put(value, id) : transaction.objectStore('clients').get(id);
    request.onsuccess = () => resolve(value ?? request.result); request.onerror = () => reject(request.error);
  });
}
function parsed(url) {
  const match = new URL(url).pathname.match(/^\/__pbl\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)(\/.*)$/);
  return match ? { project: match[1], session: match[2], path: match[3] } : null;
}
function rpc(client, message, timeout = 180000) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(Error('Le studio ne répond pas.')); }, timeout);
    channel.port1.onmessage = ({ data }) => { clearTimeout(timer); channel.port1.close(); data.ok ? resolve(data.value) : reject(Error(data.error)); };
    client.postMessage(message, [channel.port2]);
  });
}
async function owner(project) {
  const known = owners.get(project);
  if (known) { const client = await self.clients.get(known); if (client) return client; owners.delete(project); }
  for (const client of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
    const url = new URL(client.url);
    if (!['/', '/apps/studio/', '/apps/studio/index.html'].includes(url.pathname)) continue;
    try { if (await rpc(client, { type: 'pbl-discover', project }, 2000)) { owners.set(project, client.id); return client; } } catch { /* Try another studio. */ }
  }
  throw Error('Ouvrez ce projet dans son studio pour servir les fenêtres clientes.');
}
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  if (event.data?.type === 'pbl-owner') { owners.set(event.data.project, event.source.id); return; }
  if (event.data?.type === 'pbl-release') { if (owners.get(event.data.project) === event.source.id) owners.delete(event.data.project); return; }
  if (event.data?.type === 'pbl-cookie-state' && owners.get(event.data.project) === event.source.id) event.waitUntil((async () => {
    for (const client of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
      const route = await binding(client.id);
      if (route?.project === event.data.project && route.session === event.data.session) client.postMessage(event.data);
    }
  })());
  if (event.data?.type === 'pbl-cookie') event.waitUntil((async () => {
    try {
      const route = await binding(event.source.id) ?? parsed(event.source.url);
      if (!route) throw Error('Unknown preview client');
      const value = await rpc(await owner(route.project), { type: 'pbl-cookie', session: route.session, value: event.data.value, url: event.data.url });
      event.ports[0]?.postMessage({ ok: true, value });
    } catch (error) { event.ports[0]?.postMessage({ ok: false, error: error.message }); }
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/_pbl/')) return;
  event.respondWith((async () => {
    const explicit = parsed(url.href);
    const route = explicit ?? await binding(event.clientId) ?? await binding(event.replacesClientId);
    if (!route) return fetch(event.request);
    const logical = new URL(url.href); logical.pathname = explicit ? explicit.path : url.pathname;
    if (event.resultingClientId) await binding(event.resultingClientId, { project: route.project, session: route.session });
    try {
      const body = ['GET', 'HEAD'].includes(event.request.method) ? new Uint8Array() : new Uint8Array(await event.request.arrayBuffer());
      if (body.byteLength > 8 * 1024 * 1024) return new Response('Requête trop volumineuse', { status: 413 });
      const value = await rpc(await owner(route.project), { type: 'pbl-route', session: route.session, request: { url: logical.href, destination: event.request.destination, method: event.request.method, headers: [...event.request.headers], body } });
      const headers = new Headers(value.headers);
      headers.set('Cross-Origin-Opener-Policy', 'same-origin'); headers.set('Cross-Origin-Embedder-Policy', 'require-corp'); headers.set('Cache-Control', 'no-store');
      return new Response(event.request.method === 'HEAD' || [204, 205, 304].includes(value.status) ? null : value.body, { status: value.status, headers });
    } catch (error) { return new Response(error.message, { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); }
  })());
});
