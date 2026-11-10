import {DiskWorkspace} from "./disk-workspace.mjs";
import { nativeDiagnostics } from "./native-diagnostics.mjs";
import { enforceAtomicIdbfs } from './idbfs-atomic.mjs';
import { installVfsQuota } from './vfs-quota.mjs';
/** Project-owner worker: one native PHP/MariaDB instance, one bounded request queue.
 * Browser HTTP input/output and filesystem RPC use JS; SQL stays entirely in C.
 */
import { RequestQueue } from './request-queue.mjs';
import { decodeSqlFrame } from './sql-frame.mjs';
const queue = new RequestQueue({ maxPending: 32, maxBytes: 8 * 1024 * 1024 });
const encoder = new TextEncoder();
const diagnostics = nativeDiagnostics();
let module;
let vfsQuota;
let diskWorkspace;
let poisoned = false;
let projectKey;
let storageLayout='volatile',metadataPath;
let releaseLock;let explicitSync=false;
const syncFilesystem=populate=>new Promise((resolve,reject)=>{
  explicitSync=true;module.FS.syncfs(populate,error=>{explicitSync=false;error?reject(error):resolve();});
});
function projectStore(){
  return {...module.IDBFS,syncfs(mount,populate,callback){
    // SDK fd_sync also calls mount.syncfs: it must not publish a live/partial DB.
    if(populate||explicitSync)module.IDBFS.syncfs(mount,populate,callback);else callback(null);
  }};
}
async function mountProject(key,limits) {
  if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(key)) throw Error('Invalid persistent project key');
  if (!navigator.locks) throw Error('Persistent project ownership requires navigator.locks');
  await new Promise((resolve, reject) => {
    navigator.locks.request('pbl-project:' + key, { mode: 'exclusive', ifAvailable: true }, lock => {
      if (!lock) { reject(Error('This project already has a running owner')); return; }
      resolve(); return new Promise(release => { releaseLock = release; });
    }).catch(reject);
  });
  const oldFiles='/.pbl/projects/'+key,oldSql='/.pbl/sql/'+key,root='/.pbl/projects/@v2/'+key;
  let names;
  try{if(indexedDB.databases)names=new Set((await indexedDB.databases()).map(database=>database.name));}catch{/* Preserve legacy access if enumeration is unavailable. */}
  const legacy=!names||(!names.has(root)&&(names.has(oldFiles)||names.has(oldSql)));
  const files=legacy?oldFiles:root+'/files',sql=legacy?oldSql:root+'/sql';
  storageLayout=legacy?'legacy-split':'atomic-v2';
  module.FS.mkdirTree('/mariadb');
  if(legacy){module.FS.mkdirTree(files);module.FS.mkdirTree(sql);module.FS.mount(projectStore(),{},files);module.FS.mount(projectStore(),{},sql);}
  else{module.FS.mkdirTree(root);module.FS.mount(projectStore(),{},root);}
  vfsQuota=installVfsQuota(module.FS,{projectRoot:files,sqlRoot:sql,limits});
  await syncFilesystem(true);vfsQuota.clearDirty();
  module.FS.mkdirTree(files);module.FS.mkdirTree(sql);
  metadataPath=legacy?files+'/.pbl-studio-state.json':root+'/.pbl-studio-state.json';
  diskWorkspace=await DiskWorkspace.create(module,key,files,vfsQuota,projectMetadata());
  module.FS.symlink(diskWorkspace?.root??files,'/workspace');module.FS.symlink(sql,'/mariadb/data');
  storageLayout=diskWorkspace?'opfs-files-atomic-sql':storageLayout;
  projectKey=key;
}
async function saveProject(metadata) {
  if (!projectKey) throw Error('This runtime uses volatile files; no persistent project key was selected');
  await module.ccall('pbl_console_close', null, [], [], { async: true });
  const stopped=await module.ccall('pbl_mysql_stop','number',[],[],{async:true});
  if(stopped)throw Error(stopped===-2?'SQL initialization failed; export project files before discarding this runtime. The persistent snapshot was not overwritten.':'Cannot save while caller SQL connections are active');
  const diskSnapshot=diskWorkspace?await diskWorkspace.snapshot():null;
  if(diskSnapshot)metadata={...(metadata??projectMetadata()??{}),diskGeneration:diskSnapshot.catalog.id};
  try {
  if(metadata!==undefined){
    const data=JSON.stringify(metadata);if(encoder.encode(data).byteLength>8*1024*1024)throw Error('Project metadata exceeds byte limit');
    const temporary=metadataPath+'.tmp';
    try{module.FS.writeFile(temporary,data);module.FS.rename(temporary,metadataPath);}catch(error){try{module.FS.unlink(temporary);}catch{}throw error;}
  }
  await syncFilesystem(false);
  }catch(error){if(diskSnapshot)await diskWorkspace.disk.discard(diskSnapshot.created);throw error;}
  if(diskSnapshot)await diskWorkspace.commit(diskSnapshot.catalog);
  vfsQuota.clearDirty();
  return { projectKey, persisted: true, sqlStopped: true,storageLayout };
}
let upload;
function abortUpload() {
  if(!upload)return;
  clearTimeout(upload.timer);
  try{module.FS.close(upload.stream);}catch{}
  try{module.FS.unlink(upload.stage);}catch{}
  upload=undefined;
}
function touchUpload(){clearTimeout(upload.timer);upload.timer=setTimeout(abortUpload,120000);}
function projectMetadata(){
  if(!metadataPath)return null;
  try{if(module.FS.stat(metadataPath).size>8*1024*1024)throw Error('Project metadata exceeds byte limit');return JSON.parse(module.FS.readFile(metadataPath,{encoding:'utf8'}));}
  catch(error){if(error.errno===44)return null;throw error;}
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
function state() { return { diagnostics:diagnostics.stats(), sqlStarted: module._pbl_mysql_started() !== 0,sqlPhase:['dormant','running','stopped','failed'][module._pbl_mysql_phase?.()??(module._pbl_mysql_started()?1:0)], sqlConnections: module._pbl_mysql_connection_count(),nativeStatements:module._pbl_mysql_statement_count?.()??null,preparedSQLReservedBytes:module._pbl_mysql_statement_bytes?.()??null,pthreadWorkers:module._pbl_sql_threads_created?{used:module._pbl_sql_threads_used(),idle:module._pbl_sql_threads_idle(),created:module._pbl_sql_threads_created(),peak:module._pbl_sql_threads_peak()}:null, linearMemoryBytes: module.HEAPU8.buffer.byteLength, allocatorUsedBytes: module._pbl_heap_used?.() ?? null, allocatorFreeBytes: module._pbl_heap_free?.() ?? null, vfs:vfsQuota?.stats(), disk:diskWorkspace?.stats(), hardwareConcurrency: navigator.hardwareConcurrency, projectKey, storageLayout, queue: queue.stats }; }
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
      ini: 'max_execution_time=0\nmax_input_time=-1\nmemory_limit=256M\ndate.timezone=UTC\nlog_errors=1\ndisplay_errors=0\nsession.save_path="/workspace/.sessions"\nauto_prepend_file="/tmp/.alwis-curl-compat.php"\nopen_basedir="/workspace:/tmp"\n' },
    onStdout: data => append(stdout, data), onStderr: data => append(stderr, data),
    onHeaders: (code, values) => { status = code; responseHeaders = values; },
    hostCall: () => { throw Error('No JavaScript SQL host bridge is registered'); },
  };
  try {
    await module.ccall('php_wasm_run', 'number', ['string', 'number', 'number', 'number'], [script, 0, 0, 0], { async: true });
    const exitCode = module._php_wasm_exit_code();
    if (module._php_wasm_reusable?.() === 0) {
      // Ordinary PHP exceptions are recoverable. A bailout escaping the SAPI
      // or a partial startup/shutdown is not; never run the next queued job
      // against an unsafe Zend/SQL context.
      poisoned = true;
      throw Error('Native PHP SAPI startup or shutdown failed; discard this runtime');
    }
    return { status, headers: responseHeaders, body: copyChunks(stdout), stderr: copyChunks(stderr), exitCode, diskChanges:diskWorkspace?.takeChanges()??[], ...state() };
  } catch (error) { console.error(error.stack ?? error); poisoned = true; throw error; }
}
async function dispatch(message) {
  if (message.operation === 'initialize') {
    if (module) throw Error('Already initialized');
    const url = new URL(message.moduleURL, self.location.href);
    if (url.origin !== self.location.origin) throw Error('Native engine must have the same origin');
    const { default: createRuntime } = await import(url.href);
    module = await createRuntime({ noInitialRun: true, printErr: diagnostics.printErr });
    enforceAtomicIdbfs(module.IDBFS,path=>vfsQuota?.isDirty(path));
    if (message.projectKey !== undefined) await mountProject(message.projectKey,message.vfsLimits);
    if(!vfsQuota)vfsQuota=installVfsQuota(module.FS,{limits:message.vfsLimits});
    module.FS.mkdirTree('/workspace/.sessions');
    return state();
  }
  if (!module || poisoned) throw Error(poisoned ? 'Native runtime is poisoned; discard it' : 'Runtime is not initialized');
  if(upload && message.operation==='save')throw Error('Import de fichier en cours. Réessayez l’enregistrement après sa fin.');
  switch (message.operation) {
    case 'beginFile': {
      if(upload)throw Error('Un autre fichier est en cours d’import.');
      const target=path(message.path);
      if(!Number.isSafeInteger(message.size)||message.size<1||message.size>16*1024*1024)throw Error('Fichier limité à 16 Mio.');
      if(module.FS.analyzePath(target).exists)throw Error('Ce fichier existe déjà : '+target);
      const parent=target.slice(0,target.lastIndexOf('/'));module.FS.mkdirTree(parent);
      const stage=parent+'/.pbl-upload-'+crypto.randomUUID();
      upload={id:crypto.randomUUID(),target,stage,size:message.size,offset:0,stream:module.FS.open(stage,'w')};touchUpload();
      return upload.id;
    }
    case 'fileChunk': {
      if(!upload||message.upload!==upload.id)throw Error('Import de fichier expiré.');
      try {
        const data=bytes(message.data);
        if(data.length>2*1024*1024||message.offset!==upload.offset||upload.offset+data.length>upload.size)throw Error('Bloc de fichier invalide.');
        const n=module.FS.write(upload.stream,data,0,data.length,upload.offset);
        if(n!==data.length)throw Error('Écriture de fichier incomplète.');upload.offset+=n;touchUpload();return n;
      }catch(error){abortUpload();if(error.errno===51)throw Object.assign(Error('Le quota de fichiers ou de taille du projet est dépassé. Réduisez la sélection.'),{errno:51});throw error;}
    }
    case 'finishFile': {
      if(!upload||message.upload!==upload.id)throw Error('Import de fichier expiré.');
      try {
        if(upload.offset!==upload.size)throw Error('Fichier importé incomplet.');
        if(module.FS.analyzePath(upload.target).exists)throw Error('Un fichier a été créé pendant l’import. Réessayez avec un nouveau nom.');
        module.FS.close(upload.stream);module.FS.rename(upload.stage,upload.target);
        const written=upload.offset;clearTimeout(upload.timer);upload=undefined;return {written};
      }catch(error){abortUpload();throw error;}
    }
    case 'abortFile': if(upload?.id===message.upload)abortUpload();return true;
    case 'diskCatalog': return diskWorkspace?.catalog()??[];
    case 'previewFile': {const stream=module.FS.open(path(message.path),'r');try{const output=new Uint8Array(Math.min(65536,module.FS.stat(path(message.path)).size));const n=module.FS.read(stream,output,0,output.length,0);return output.slice(0,n);}finally{module.FS.close(stream);}}
    case 'diskFile': if(!diskWorkspace)throw Error('Stockage disque non disponible.');return diskWorkspace.file(path(message.path).slice('/workspace'.length));
    case 'attachDiskFile': if(!diskWorkspace)throw Error('Stockage disque non disponible.');return diskWorkspace.register(message.entry);
    case 'write': {
      const data = bytes(message.data);
      if('expected' in message){
        if(message.expected!==null&&typeof message.expected!=='string')throw Error('Invalid expected file content');
        const filename=path(message.path),exists=module.FS.analyzePath(filename).exists;
        const equal=(a,b)=>a.length===b.length&&a.every((value,index)=>value===b[index]);
        if(message.expected===null&&exists)throw Error('Ce fichier existe déjà. Chargez-le avant de l’écrire.');
        if(message.expected!==null){if(!exists)throw Error('Le fichier a été supprimé. Choisissez un nouveau chemin.');const current=module.FS.readFile(filename);if(!equal(current,bytes(message.expected))&&!equal(current,data))throw Error('Le fichier a changé dans le projet. Rechargez-le avant de l’écraser.');}
      }
      const pointer = module._malloc(data.byteLength || 1);
      if (!pointer) throw Error('Native allocation failed');
      try {
        module.HEAPU8.set(data, pointer);
        const status = await module.ccall('pbl_fs_write', 'number', ['string', 'number', 'number'], [path(message.path), pointer, data.byteLength], { async: true });
        if (status !== 0) throw Error(status===-51?'Project filesystem quota exceeded':'Native write failed: ' + status);
        return { written: data.byteLength };
      } finally { module._free(pointer); }
    }
    case 'read': {
      const filename = path(message.path);
      if (module.FS.stat(filename).size > 16 * 1024 * 1024) throw Error('File exceeds read limit');
      return module.FS.readFile(filename);
    }
    case 'stat': { const info = module.FS.stat(message.path === '/workspace' ? '/workspace' : path(message.path)); return { directory: module.FS.isDir(info.mode), size: info.size }; }
    case 'list': return module.FS.readdir(message.path === '/workspace' ? '/workspace' : path(message.path));
    case 'remove': case 'rename': {
      if(message.operation==='rename'&&message.exclusive&&module.FS.analyzePath(path(message.target)).exists)throw Error('Ce fichier existe déjà. Choisissez un autre chemin.');
      const status = message.operation === 'remove'
        ? await module.ccall('pbl_fs_remove', 'number', ['string'], [path(message.path)], { async: true })
        : await module.ccall('pbl_fs_rename', 'number', ['string', 'string'], [path(message.path), path(message.target)], { async: true });
      if (status !== 0) throw Error('Native file operation failed: ' + status);
      return true;
    }
    case 'request': return request(message);
    case 'metadata': return projectMetadata();
    case 'save': return saveProject(message.metadata);
    case 'release': abortUpload();await diskWorkspace?.discard();releaseLock?.(); releaseLock = undefined; poisoned = true; return true;
    case 'closeConsole': await module.ccall('pbl_console_close', null, [], [], { async: true }); return state();
    case 'sql': {
      if (message.database !== undefined && (typeof message.database !== 'string' || message.database.includes('\0'))) throw Error('Invalid database name');
      const opened = await module.ccall('pbl_console_open', 'number', ['string'], [message.database ?? ''], { async: true });
      if (!opened) throw Object.assign(Error(module.UTF8ToString(module._pbl_console_error())),{sqlstate:module.UTF8ToString(module._pbl_console_sqlstate()),errno:module._pbl_console_errno()});
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
    case 'sqlScript': {
      if(!Array.isArray(message.statements)||!message.statements.length||message.statements.length>256||message.statements.some(s=>typeof s!=='string'||s.includes('\0')))throw Error('SQL script requires 1–256 statements without null bytes');
      if(message.database!==undefined&&(typeof message.database!=='string'||message.database.includes('\0')))throw Error('Invalid database');
      const results=[];let transferred=0,totalRows=0,completed=0;
      const failure=()=>Object.assign(Error(module.UTF8ToString(module._pbl_console_error())),{errno:module._pbl_console_errno(),sqlstate:module.UTF8ToString(module._pbl_console_sqlstate())});
      if(!await module.ccall('pbl_console_open','number',['string'],[message.database??''],{async:true}))throw failure();
      try{
        for(const statement of message.statements){
          const sql=bytes(statement),allocation=module._malloc(sql.length||1);if(!allocation)throw Error('SQL input allocation failed');let pointer=0;
          try{
            module.HEAPU8.set(sql,allocation);pointer=await module.ccall('pbl_console_query','number',['number','number'],[allocation,sql.length],{async:true});
            for(;;){if(!pointer)throw failure();const length=module._pbl_console_length();if(transferred+length>16*1024*1024||results.length>=256)throw Error('Script result exceeds 16 MiB / 256 result sets');transferred+=length;
              const result=decodeSqlFrame(module.HEAPU8.slice(pointer,pointer+length));totalRows+=result.rows.length;if(totalRows>10000)throw Error('Script result exceeds 10000 rows');results.push(result);module._free(pointer);pointer=0;
              if(!module._pbl_console_more_results())break;pointer=await module.ccall('pbl_console_next_result','number',[],[],{async:true});
            }
          }finally{if(pointer)module._free(pointer);module._free(allocation);}completed++;
        }
        return results;
      }catch(error){await module.ccall('pbl_console_close',null,[],[],{async:true});throw Object.assign(Error(`Script interrompu après ${completed} instruction(s). Les instructions déjà validées peuvent être appliquées. ${error.message}`),{errno:error.errno,sqlstate:error.sqlstate});}
    }
    case 'state': return state();
    case 'stopSQL': { const status = await module.ccall('pbl_mysql_stop', 'number', [], [], { async: true }); if (status !== 0) throw Error('SQL has active connections'); return state(); }
    default: throw Error('Unsupported native runtime operation');
  }
}
self.onmessage = event => {
  const message = event.data;
  if (!message || !Number.isSafeInteger(message.id)) return;
  // An active EM_ASYNC_JS Fetch yields to the worker event loop. This fast
  // control path avoids waiting behind the very PHP request being canceled.
  // It cannot interrupt arbitrary synchronous PHP code or MariaDB queries.
  if (message.operation === 'abortHttp') {
    const abort = module?.phpWasm?.pendingFetchAbort;
    if (typeof abort === 'function') abort();
    self.postMessage({ id: message.id, ok: true, value: typeof abort === 'function' });
    return;
  }
  let admittedBytes;
  try { admittedBytes = bytes(message.data).byteLength + bytes(message.body).byteLength + bytes(message.sql).byteLength; }
  catch (error) { self.postMessage({ id: message.id, ok: false, error: error.message }); return; }
  queue.run(() => dispatch(message), { bytes: admittedBytes }).then(value => {
    const transfers = value instanceof Uint8Array ? [value.buffer] : value?.body ? [value.body.buffer, value.stderr.buffer] : [];
    self.postMessage({ id: message.id, ok: true, value }, transfers);
  }, error => self.postMessage({ id: message.id, ok: false, error: error.message, code: error.code, errno: error.errno, sqlstate: error.sqlstate }));
};
