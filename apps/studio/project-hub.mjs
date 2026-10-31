import { NativeRuntime } from '/packages/runtime/src/native-runtime.mjs';
import { ClientSessions } from '/packages/runtime/src/client-sessions.mjs';
import { readState, writeState } from './state.mjs';
const decoder = new TextDecoder(), encoder = new TextEncoder();
const mime = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json', txt: 'text/plain; charset=utf-8', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', gif: 'image/gif', ico: 'image/x-icon', wasm: 'application/wasm' };
export class ProjectHub {
  static async open(key) {
    const saved = await readState('sessions:' + key);
    const hub = new ProjectHub(); hub.key = key; hub.sessions = new ClientSessions(saved ?? []);
    hub.runtime = await NativeRuntime.create({ moduleURL: new URL('/engine/pbl-runtime.mjs', location.href).href, projectKey: key });
    if (!hub.sessions.sessions.size) hub.sessions.create('Session A');
    return hub;
  }
  async saveSessions() { await writeState('sessions:' + this.key, this.sessions.export()); }
  async createSession(label) { const id = this.sessions.create(label); await this.saveSessions(); return id; }
  routeURL(session, path = '/index.php') { return `/__pbl/${encodeURIComponent(this.key)}/${encodeURIComponent(session)}/${path.replace(/^\//, '')}`; }
  async route(sessionId, input) {
    if (this.busy) return { status: 503, headers: [['Content-Type', 'text/plain']], body: encoder.encode('Projet en cours de sauvegarde. Réessayez dans un instant.') };
    const session = this.sessions.get(sessionId), url = new URL(input.url);
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { return this.error(400, 'Chemin invalide'); }
    if (pathname.includes('\0') || pathname.split('/').includes('..') || pathname.startsWith('/.pbl-')) return this.error(403, 'Chemin réservé');
    if (pathname.endsWith('/')) {
      for (const index of ['index.php', 'index.html']) {
        try { await this.runtime.read('/workspace' + pathname + index); pathname += index; break; } catch { /* Try the documented directory index. */ }
      }
    }
    let body, headers = [], status = 200, cookiesChanged = false;
    if (/\.php$/i.test(pathname)) {
      const requestHeaders = (input.headers ?? []).filter(([name]) => name.toLowerCase() !== 'cookie');
      const cookies = session.jar.header(url);
      if (cookies) requestHeaders.push(['Cookie', cookies]);
      const result = await this.runtime.request({ script: '/workspace' + pathname, url: url.href, method: input.method, headers: requestHeaders, body: input.body });
      status = result.status; body = result.body;
      for (const line of result.headers) {
        const colon = line.indexOf(':'); if (colon < 1) continue;
        const name = line.slice(0, colon), value = line.slice(colon + 1).trim();
        if (name.toLowerCase() === 'set-cookie') cookiesChanged = session.jar.set(value, url) || cookiesChanged;
        else if (name.toLowerCase() === 'location') {
          const target = new URL(value, url);
          headers.push([name, target.origin === url.origin ? this.routeURL(sessionId, target.pathname) + target.search + target.hash : target.href]);
        } else if (!['content-length', 'transfer-encoding', 'connection'].includes(name.toLowerCase())) headers.push([name, value]);
      }
      if (cookiesChanged) { await this.saveSessions(); this.broadcastCookies(sessionId); }
    } else {
      try { body = await this.runtime.read('/workspace' + pathname); }
      catch { return this.error(404, 'Fichier introuvable'); }
      headers.push(['Content-Type', mime[pathname.split('.').pop()?.toLowerCase()] ?? 'application/octet-stream']);
    }
    if (['document','iframe'].includes(input.destination) && headers.some(([name, value]) => name.toLowerCase() === 'content-type' && value.toLowerCase().includes('text/html'))) {
      const context = { project: this.key, session: sessionId, prefix: this.routeURL(sessionId, '/'), logicalURL: url.href, cookies: session.jar.publicEntries() };
      const config = JSON.stringify(context).replace(/</g, '\\u003c');
      const bootstrap = `<script>window.__PBL_CONTEXT=${config};</script><script src="/_pbl/client.js"></script>`;
      const html = decoder.decode(body);
      body = encoder.encode(/<head(?:\s[^>]*)?>/i.test(html) ? html.replace(/<head(?:\s[^>]*)?>/i, match => match + bootstrap) : bootstrap + html);
    }
    return { status, headers, body };
  }
  error(status, message) { return { status, headers: [['Content-Type', 'text/plain; charset=utf-8']], body: encoder.encode(message) }; }
  broadcastCookies(id) { navigator.serviceWorker.controller?.postMessage({ type: 'pbl-cookie-state', project: this.key, session: id, cookies: this.sessions.get(id).jar.publicEntries() }); }
  async setCookie(sessionId, value, url) {
    const session = this.sessions.get(sessionId); session.jar.set(value, url, { javascript: true }); await this.saveSessions(); this.broadcastCookies(sessionId); return session.jar.publicEntries();
  }
  async saveAndRestart() {
    this.busy = true;
    try {
      await this.saveSessions(); await this.runtime.shutdown();
      this.runtime = await NativeRuntime.create({ moduleURL: new URL('/engine/pbl-runtime.mjs', location.href).href, projectKey: this.key });
    } finally { this.busy = false; }
  }
  async close() { this.busy = true; await this.saveSessions(); await this.runtime.shutdown(); }
}
