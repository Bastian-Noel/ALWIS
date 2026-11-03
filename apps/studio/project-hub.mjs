import { NativeRuntime } from '/packages/runtime/src/native-runtime.mjs';
import { ClientSessions } from '/packages/runtime/src/client-sessions.mjs';
import { readState, writeState } from './state.mjs';
const decoder = new TextDecoder(), encoder = new TextEncoder();
const mime = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json', txt: 'text/plain; charset=utf-8', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', gif: 'image/gif', ico: 'image/x-icon', wasm: 'application/wasm' };
export class ProjectHub {
  static async open(key) {
    const hub=new ProjectHub();hub.key=key;hub.inFlight=new Set();
    hub.runtime=await NativeRuntime.create({moduleURL:new URL('/engine/pbl-runtime.mjs',location.href).href,projectKey:key});
    try{
      const checkpoint=await hub.runtime.metadata();const saved=checkpoint?.sessions??await readState('sessions:'+key);
      hub.sessions=new ClientSessions(saved??[]);if(!hub.sessions.sessions.size)hub.sessions.create('Session A');return hub;
    }catch(error){hub.runtime.close();throw error;}
  }
  track(promise){this.inFlight.add(promise);promise.then(()=>this.inFlight.delete(promise),()=>this.inFlight.delete(promise));return promise;}
  async freeze(){this.busy=true;await Promise.allSettled([...this.inFlight]);}
  snapshot(){return {format:1,sessions:this.sessions.export()};}
  async saveSessions() { await writeState('sessions:' + this.key, this.sessions.export()); }
  async createSession(label) { const id = this.sessions.create(label); await this.saveSessions(); return id; }
  async removeSession(id) {
    if(this.busy)throw Error('Le projet est occupé. Réessayez après l’opération en cours.');
    const session=this.sessions.get(id);
    if(this.sessions.sessions.size<=1)throw Error('Conservez au moins une session. Créez-en une autre avant de supprimer celle-ci.');
    await this.freeze();
    try {
      this.sessions.sessions.delete(id);
      try { await this.saveSessions(); }
      catch(error) { this.sessions.sessions.set(id,session); throw error; }
    } finally { this.busy=false; }
  }
  routeURL(session, path = '/index.php') { return `/__pbl/${encodeURIComponent(this.key)}/${encodeURIComponent(session)}/${path.replace(/^\//, '')}`; }
  route(sessionId,input){
    if(this.lastSaveError)return Promise.resolve(this.error(503,'Sauvegarde échouée. Le propriétaire doit réessayer la sauvegarde avant de reprendre les clients.'));
    if(this.busy)return Promise.resolve(this.error(503,'Projet en cours de sauvegarde. Réessayez dans un instant.'));
    const started=performance.now();
    return this.track(this.serveRequest(sessionId,input).then(response=>{this.onRequest?.({session:sessionId,method:input.method??'GET',path:new URL(input.url).pathname,status:response.status,durationMs:performance.now()-started});return response;}));
  }
  async serveRequest(sessionId, input) {
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
      if(result.stderr?.byteLength)this.onDiagnostic?.(`PHP a signalé un problème dans ${pathname}. Corrigez le fichier puis relancez la requête.`,decoder.decode(result.stderr.subarray(0,8192)));
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
  setCookie(sessionId,value,url){
    if(this.busy){this.broadcastCookies(sessionId);return Promise.reject(Error('Projet en cours de sauvegarde. Réessayez le cookie.'));}
    return this.track(this.applyCookie(sessionId,value,url));
  }
  async applyCookie(sessionId, value, url) {
    const session = this.sessions.get(sessionId); session.jar.set(value, url, { javascript: true }); await this.saveSessions(); this.broadcastCookies(sessionId); return session.jar.publicEntries();
  }
  async saveAndRestart() {
    await this.freeze();
    try {
      await this.saveSessions();
      if(!this.runtime.closed){await this.runtime.shutdown({metadata:this.snapshot()});this.checkpointCommitted=true;}
      else if(!this.checkpointCommitted)throw Error('Moteur perdu : rouvrez le projet depuis sa dernière sauvegarde.');
      this.runtime = await NativeRuntime.create({ moduleURL: new URL('/engine/pbl-runtime.mjs', location.href).href, projectKey: this.key });this.lastSaveError=null;this.checkpointCommitted=false;
    } catch(error){this.lastSaveError=error;throw error;} finally { this.busy = false; for(const session of this.sessions.sessions.values())this.broadcastCookies(session.id); }
  }
  async close({save=true}={}) { await this.freeze();try{if(save)await this.saveSessions();if(!this.runtime.closed)await this.runtime.shutdown({save,metadata:this.snapshot()});}catch(error){this.busy=false;throw error;} }
}
