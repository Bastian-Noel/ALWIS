/** Project-owner worker: one native PHP/MariaDB instance, one bounded request queue.
 * Browser HTTP input/output and filesystem RPC use JS; SQL stays entirely in C.
 */
import { RequestQueue } from './request-queue.mjs';
import { decodeSqlFrame } from './sql-frame.mjs';
const queue = new RequestQueue({ maxPending: 32, maxBytes: 8 * 1024 * 1024 });
const encoder = new TextEncoder();
let module;
let poisoned = false;
let projectKey;
let releaseLock;
const syncFilesystem = populate => new Promise((resolve, reject) => module.FS.syncfs(populate, error => error ? reject(error) : resolve()));
async function mountProject(key) {
  if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(key)) throw Error('Invalid persistent project key');
  if (!navigator.locks) throw Error('Persistent project ownership requires navigator.locks');
  await new Promise((resolve, reject) => {
    navigator.locks.request('pbl-project:' + key, { mode: 'exclusive', ifAvailable: true }, lock => {
      if (!lock) { reject(Error('This project already has a running owner')); return; }
      resolve(); return new Promise(release => { releaseLock = release; });
    }).catch(reject);
  });
  const files = '/.pbl/projects/' + key, sql = '/.pbl/sql/' + key;
  module.FS.mkdirTree(files); module.FS.mkdirTree(sql); module.FS.mkdirTree('/mariadb');
  module.FS.mount(module.IDBFS, {}, files); module.FS.mount(module.IDBFS, {}, sql);
  await syncFilesystem(true);
  module.FS.symlink(files, '/workspace'); module.FS.symlink(sql, '/mariadb/data');
  projectKey = key;
}
async function saveProject() {
  if (!projectKey) throw Error('This runtime uses volatile files; no persistent project key was selected');
  await module.ccall('pbl_console_close', null, [], [], { async: true });
  if (await module.ccall('pbl_mysql_stop', 'number', [], [], { async: true })) throw Error('Cannot save while caller SQL connections are active');
  await syncFilesystem(false);
  return { projectKey, persisted: true, sqlStopped: true };
}
function path(value) {
  if (typeof value !== 'string' || !value.startsWith('/workspace/') || value.includes('\0') || value.split('/').includes('..') || value.length > 4000) throw Error('Invalid project path');
  return value;
}
function bytes(value) {
  if (value === undefined) return new Uint8Array();
  if (typeof value === 'string') return encoder.encode(value);
  if (!(value instanceof Uint8Array)) throw Error('Expected UTF-8 text or Uint8Array');
  return value;
}
function copyChunks(chunks) {
  const output = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}
function state() { return { sqlStarted: module._pbl_mysql_started() !== 0, sqlConnections: module._pbl_mysql_connection_count(), linearMemoryBytes: module.HEAPU8.buffer.byteLength, hardwareConcurrency: navigator.hardwareConcurrency, projectKey, queue: queue.stats }; }
async function request(input) {
  const script = path(input.script);
  const url = new URL(input.url ?? 'https://project.local' + script.slice('/workspace'.length));
  const body = bytes(input.body);
  const method = input.method ?? 'GET';
  if (!/^[A-Z]+$/.test(method)) throw Error('Invalid HTTP method');
  const headers = new Map();
  for (const [rawName, rawValue] of input.headers ?? []) {
    const name = String(rawName).toLowerCase(), value = String(rawValue);
    if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(name) || /[\r\n\0]/.test(value)) throw Error('Invalid HTTP header');
    headers.set(name, headers.has(name) ? headers.get(name) + (name === 'cookie' ? '; ' : ', ') + value : value);
  }
  const stdout = [], stderr = [];
  let outputBytes = 0;
  const append = (target, value) => {
    const data = typeof value === 'string' ? encoder.encode(value) : value;
    outputBytes += data.byteLength;
    if (outputBytes > 8 * 1024 * 1024) { poisoned = true; throw Error('Native HTTP output limit exceeded; discard this instance'); }
    target.push(data.slice());
  };
  const server = {
    SERVER_SOFTWARE: 'WASMWebServer', SERVER_PROTOCOL: 'HTTP/1.1',
    SERVER_NAME: url.hostname, SERVER_PORT: url.port || (url.protocol === 'https:' ? '443' : '80'),
    REQUEST_METHOD: method, REQUEST_URI: url.pathname + url.search,
    QUERY_STRING: url.search.slice(1), REQUEST_SCHEME: url.protocol.slice(0, -1),
    SCRIPT_FILENAME: script, SCRIPT_NAME: script.slice('/workspace'.length), PHP_SELF: script.slice('/workspace'.length),
    DOCUMENT_ROOT: '/workspace', HTTP_HOST: url.host, HTTPS: url.protocol === 'https:' ? 'on' : '',
    CONTENT_LENGTH: String(body.byteLength), REMOTE_ADDR: '127.0.0.1', REMOTE_PORT: '0',
  };
  for (const [name, value] of headers) {
    if (name === 'content-type') server.CONTENT_TYPE = value;
    else if (!['content-length', 'host'].includes(name)) server['HTTP_' + name.toUpperCase().replaceAll('-', '_')] = value;
  }
  let status = 200, responseHeaders = [];
  module.phpWasm = {
    request: { method, uri: url.pathname + url.search, query: url.search.slice(1), contentType: headers.get('content-type') ?? '', cookie: headers.get('cookie') ?? '', body,
      env: { PATH: '/usr/bin:/bin', TMPDIR: '/tmp', TZ: 'UTC' }, server,
      ini: 'max_execution_time=0\nmax_input_time=-1\nmemory_limit=256M\ndate.timezone=UTC\nlog_errors=1\ndisplay_errors=0\nsession.save_path="/workspace/.sessions"\nopen_basedir="/workspace:/tmp"\n' },
    onStdout: data => append(stdout, data), onStderr: data => append(stderr, data),
    onHeaders: (code, values) => { status = code; responseHeaders = values; },
    hostCall: () => { throw Error('No JavaScript SQL host bridge is registered'); },
  };
  try {
    await module.ccall('php_wasm_run', 'number', ['string', 'number', 'number', 'number'], [script, 0, 0, 0], { async: true });
    const exitCode = module._php_wasm_exit_code();
    return { status, headers: responseHeaders, body: copyChunks(stdout), stderr: copyChunks(stderr), exitCode, ...state() };
  } catch (error) { console.error(error.stack ?? error); poisoned = true; throw error; }
}
async function dispatch(message) {
  if (message.operation === 'initialize') {
    if (module) throw Error('Already initialized');
    const url = new URL(message.moduleURL, self.location.href);
    if (url.origin !== self.location.origin) throw Error('Native engine must have the same origin');
    const { default: createRuntime } = await import(url.href);
    module = await createRuntime({ noInitialRun: true });
    if (message.projectKey !== undefined) await mountProject(message.projectKey);
    module.FS.mkdirTree('/workspace/.sessions');
    return state();
  }
  if (!module || poisoned) throw Error(poisoned ? 'Native runtime is poisoned; discard it' : 'Runtime is not initialized');
  switch (message.operation) {
    case 'write': {
      const data = bytes(message.data); const pointer = module._malloc(data.byteLength || 1);
      if (!pointer) throw Error('Native allocation failed');
      try {
        module.HEAPU8.set(data, pointer);
        const status = await module.ccall('pbl_fs_write', 'number', ['string', 'number', 'number'], [path(message.path), pointer, data.byteLength], { async: true });
        if (status !== 0) throw Error('Native write failed: ' + status);
        return { written: data.byteLength };
      } finally { module._free(pointer); }
    }
    case 'read': {
      const filename = path(message.path);
      if (module.FS.stat(filename).size > 16 * 1024 * 1024) throw Error('File exceeds read limit');
      return module.FS.readFile(filename).slice();
    }
    case 'stat': { const info = module.FS.stat(message.path === '/workspace' ? '/workspace' : path(message.path)); return { directory: module.FS.isDir(info.mode), size: info.size }; }
    case 'list': return module.FS.readdir(message.path === '/workspace' ? '/workspace' : path(message.path));
    case 'remove': case 'rename': {
      const status = message.operation === 'remove'
        ? await module.ccall('pbl_fs_remove', 'number', ['string'], [path(message.path)], { async: true })
        : await module.ccall('pbl_fs_rename', 'number', ['string', 'string'], [path(message.path), path(message.target)], { async: true });
      if (status !== 0) throw Error('Native file operation failed: ' + status);
      return true;
    }
    case 'request': return request(message);
    case 'save': return saveProject();
    case 'release': releaseLock?.(); releaseLock = undefined; poisoned = true; return true;
    case 'closeConsole': await module.ccall('pbl_console_close', null, [], [], { async: true }); return state();
    case 'sql': {
      if (message.database !== undefined && (typeof message.database !== 'string' || message.database.includes('\0'))) throw Error('Invalid database name');
      const opened = await module.ccall('pbl_console_open', 'number', ['string'], [message.database ?? ''], { async: true });
      if (!opened) throw Error(module.UTF8ToString(module._pbl_console_error()));
      const sql = bytes(message.sql);
      const allocation = module._malloc(sql.length || 1);
      if (!allocation) throw Error('SQL input allocation failed');
      let result;
      try {
        module.HEAPU8.set(sql, allocation);
        result = await module.ccall('pbl_console_query', 'number', ['number', 'number'], [allocation, sql.length], { async: true });
        if (!result) throw Object.assign(new Error(module.UTF8ToString(module._pbl_console_error())), { sqlstate: module.UTF8ToString(module._pbl_console_sqlstate()), errno: module._pbl_console_errno() });
        return decodeSqlFrame(module.HEAPU8.slice(result, result + module._pbl_console_length()));
      } finally { if (result) module._free(result); module._free(allocation); }
    }
    case 'state': return state();
    case 'stopSQL': { const status = await module.ccall('pbl_mysql_stop', 'number', [], [], { async: true }); if (status !== 0) throw Error('SQL has active connections'); return state(); }
    default: throw Error('Unsupported native runtime operation');
  }
}
self.onmessage = event => {
  const message = event.data;
  if (!message || !Number.isSafeInteger(message.id)) return;
  let admittedBytes;
  try { admittedBytes = bytes(message.data).byteLength + bytes(message.body).byteLength + bytes(message.sql).byteLength; }
  catch (error) { self.postMessage({ id: message.id, ok: false, error: error.message }); return; }
  queue.run(() => dispatch(message), { bytes: admittedBytes }).then(value => {
    const transfers = value instanceof Uint8Array ? [value.buffer] : value?.body ? [value.body.buffer, value.stderr.buffer] : [];
    self.postMessage({ id: message.id, ok: true, value }, transfers);
  }, error => self.postMessage({ id: message.id, ok: false, error: error.message, code: error.code }));
};
