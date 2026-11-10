/** Virtual HTTP identities. SQL connections are deliberately unrelated to these IDs. */
const token = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
export class CookieJar {
  constructor(entries = []) { this.entries = entries.slice(0, 64); }
  set(line, url, { javascript = false, now = Date.now() } = {}) {
    url = new URL(url);
    if (typeof line !== 'string' || line.length > 4096 || /[\r\n\0]/.test(line)) return false;
    const parts = line.split(';'), first = parts.shift(), equals = first.indexOf('=');
    if (equals <= 0) return false;
    const name = first.slice(0, equals).trim(), value = first.slice(equals + 1).trim();
    if (!token.test(name)) return false;
    const attrs = new Map(parts.map(part => { const i = part.indexOf('='); return [part.slice(0, i < 0 ? undefined : i).trim().toLowerCase(), i < 0 ? '' : part.slice(i + 1).trim()]; }));
    // The initial virtual origin supports host cookies and an exact-host Domain.
    const domain = (attrs.get('domain') ?? url.hostname).replace(/^\./, '').toLowerCase();
    if (domain !== url.hostname.toLowerCase()) return false;
    const defaultPath = url.pathname.slice(0, url.pathname.lastIndexOf('/')) || '/';
    const path = attrs.get('path')?.startsWith('/') ? attrs.get('path') : defaultPath;
    const secure = attrs.has('secure'), httpOnly = !javascript && attrs.has('httponly');
    if (secure && url.protocol !== 'https:') return false;
    if (name.startsWith('__Secure-') && !secure) return false;
    if (name.startsWith('__Host-') && (!secure || path !== '/' || attrs.has('domain'))) return false;
    const index = this.entries.findIndex(item => item.name === name && item.domain === domain && item.path === path);
    if (javascript && index >= 0 && this.entries[index].httpOnly) return false;
    let expires = attrs.has('expires') ? Date.parse(attrs.get('expires')) : null;
    if (attrs.has('max-age') && /^-?\d+$/.test(attrs.get('max-age'))) expires = now + Number(attrs.get('max-age')) * 1000;
    if (!Number.isFinite(expires)) expires = null;
    if (index >= 0) this.entries.splice(index, 1);
    if (expires !== null && expires <= now) return true;
    if (this.entries.length >= 64) this.entries.shift();
    this.entries.push({ name, value, domain, path, secure, httpOnly, expires, created: now });
    return true;
  }
  matching(url, { javascript = false, now = Date.now() } = {}) {
    url = new URL(url); this.entries = this.entries.filter(item => item.expires === null || item.expires > now);
    return this.entries.filter(item => item.domain === url.hostname && (!item.secure || url.protocol === 'https:') && (!javascript || !item.httpOnly)
      && (url.pathname === item.path || (url.pathname.startsWith(item.path) && (item.path.endsWith('/') || url.pathname[item.path.length] === '/'))))
      .sort((a, b) => b.path.length - a.path.length || a.created - b.created);
  }
  header(url, options) { return this.matching(url, options).map(item => item.name + '=' + item.value).join('; '); }
  publicEntries() { return this.entries.filter(item => !item.httpOnly).map(item => ({ ...item })); }
}
export class ClientSessions {
  constructor(saved = [], { maxSessions = 128 } = {}) {
    this.maxSessions = maxSessions;
    this.sessions = new Map(saved.slice(0, maxSessions).map(item => [item.id, { id: item.id, label: String(item.label), jar: new CookieJar(item.cookies) }]));
  }
  create(label) {
    if (this.sessions.size >= this.maxSessions) throw Error('Session limit reached');
    const id = crypto.randomUUID(); this.sessions.set(id, { id, label: label ?? `Client ${this.sessions.size + 1}`, jar: new CookieJar() }); return id;
  }
  createMany(labels) {
    if (!Array.isArray(labels) || labels.length < 1 || labels.length > 16 ||
        labels.some(label => typeof label !== 'string' || !label.trim() || label.length > 80))
      throw Error('Invalid session list');
    if (this.sessions.size + labels.length > this.maxSessions) throw Error('Session limit reached');
    return labels.map(label => this.create(label.trim()));
  }
  get(id) { const value = this.sessions.get(id); if (!value) throw Error('Unknown client session'); return value; }
  export() { return [...this.sessions.values()].map(({ id, label, jar }) => ({ id, label, cookies: jar.entries })); }
}
