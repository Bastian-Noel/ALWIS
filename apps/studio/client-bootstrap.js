/* Small same-origin virtual client adapter. Not a security boundary for hostile code. */
(() => {
  const context = window.__PBL_CONTEXT;
  if (!context) return;
  delete window.__PBL_CONTEXT;
  const physicalLocal = window.localStorage, physicalSession = window.sessionStorage;
  const storage = native => {
    const prefix = `pbl-client:${context.project}:${context.session}:`;
    const keys = () => Array.from({ length: native.length }, (_, i) => native.key(i)).filter(key => key.startsWith(prefix));
    const api = {
      getItem: key => native.getItem(prefix + key), setItem: (key, value) => native.setItem(prefix + key, String(value)),
      removeItem: key => native.removeItem(prefix + key), clear: () => keys().forEach(key => native.removeItem(key)),
      key: index => keys()[index]?.slice(prefix.length) ?? null,
    };
    return new Proxy(api, {
      get: (target, key) => key === 'length' ? keys().length : key in target ? target[key] : typeof key === 'symbol' ? undefined : target.getItem(key),
      set: (target, key, value) => { target.setItem(key, value); return true; },
      deleteProperty: (target, key) => { target.removeItem(key); return true; },
      ownKeys: () => keys().map(key => key.slice(prefix.length)),
      getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    });
  };
  const virtualLocal = storage(physicalLocal);
  Object.defineProperty(window, 'localStorage', { configurable: true, value: virtualLocal });
  window.addEventListener('storage', event => {
    if (!event.isTrusted || event.storageArea !== physicalLocal) return;
    event.stopImmediatePropagation();
    const prefix = `pbl-client:${context.project}:${context.session}:`;
    if (event.key !== null && !event.key.startsWith(prefix)) return;
    const replacement = new StorageEvent('storage', { key: event.key?.slice(prefix.length) ?? null, oldValue: event.oldValue, newValue: event.newValue, url: event.url });
    Object.defineProperty(replacement, 'storageArea', { value: virtualLocal }); window.dispatchEvent(replacement);
  }, true);
  Object.defineProperty(window, 'sessionStorage', { configurable: true, value: storage(physicalSession) });
  const factory = indexedDB, open = factory.open.bind(factory), remove = factory.deleteDatabase.bind(factory);
  const dbPrefix = `pbl-client:${context.project}:${context.session}:`;
  factory.open = (name, version) => {
    const request = version === undefined ? open(dbPrefix + name) : open(dbPrefix + name, version);
    const expose = () => { try { if (!Object.hasOwn(request.result, 'name')) Object.defineProperty(request.result, 'name', { value: String(name) }); } catch { /* Name is informative, not storage identity. */ } };
    request.addEventListener('upgradeneeded', expose); request.addEventListener('success', expose); return request;
  };
  factory.deleteDatabase = name => remove(dbPrefix + name);
  if (factory.databases) { const databases = factory.databases.bind(factory); factory.databases = async () => (await databases()).filter(item => item.name.startsWith(dbPrefix)).map(item => ({ ...item, name: item.name.slice(dbPrefix.length) })); }
  const route = value => {
    const url = new URL(value, location.href);
    if (url.origin === location.origin && !url.pathname.startsWith('/__pbl/') && !url.pathname.startsWith('/_pbl/')) url.pathname = context.prefix + url.pathname.replace(/^\//, '');
    return url.href;
  };
  const logical = () => { const url = new URL(location.href); if (url.pathname.startsWith(context.prefix)) url.pathname = '/' + url.pathname.slice(context.prefix.length); return url; };
  let cookies = context.cookies, pending = Promise.resolve();
  navigator.serviceWorker.addEventListener('message', ({ data }) => { if (data?.type === 'pbl-cookie-state' && data.project === context.project && data.session === context.session) cookies = data.cookies; });
  const visible = () => {
    const url = logical();
    return cookies.filter(c => (c.expires === null || c.expires > Date.now()) && (!c.secure || url.protocol === 'https:') && (url.pathname === c.path || (url.pathname.startsWith(c.path) && (c.path.endsWith('/') || url.pathname[c.path.length] === '/')))).sort((a, b) => b.path.length - a.path.length).map(c => c.name + '=' + c.value).join('; ');
  };
  Object.defineProperty(document, 'cookie', { configurable: true, get: visible, set: value => {
    const line = String(value), first = line.split(';')[0], equals = first.indexOf('=');
    if (equals < 1 || line.length > 4096) return;
    const name = first.slice(0, equals).trim(), text = first.slice(equals + 1).trim(), url = logical();
    cookies = cookies.filter(item => item.name !== name);
    cookies.push({ name, value: text, path: url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1) || '/', secure: false, expires: null });
    pending = pending.then(() => new Promise((resolve, reject) => {
      const channel = new MessageChannel(), timer = setTimeout(() => { channel.port1.close(); reject(Error('Cookie update timed out')); }, 10000);
      channel.port1.onmessage = ({ data }) => { clearTimeout(timer); channel.port1.close(); if (data.ok) { cookies = data.value; resolve(); } else reject(Error(data.error)); };
      navigator.serviceWorker.controller.postMessage({ type: 'pbl-cookie', value: line, url: url.href }, [channel.port2]);
    }));
  } });
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => { await pending; return nativeFetch(input instanceof Request ? new Request(route(input.url), input) : route(input), init); };
  const nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) { return nativeOpen.call(this, method, route(url), ...rest); };
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]'); if (link) link.href = route(link.href);
  }, true);
  document.addEventListener('submit', event => { event.target.action = route(event.target.action); }, true);
  const rewrite = root => root.querySelectorAll?.('[src],link[href],form[action],a[href]').forEach(element => {
    for (const attr of ['src', 'href', 'action']) if (element.hasAttribute(attr)) {
      const value = element.getAttribute(attr); if (value?.startsWith('/') && !value.startsWith('//')) element.setAttribute(attr, route(value));
    }
  });
  document.addEventListener('DOMContentLoaded', () => rewrite(document));
})();
