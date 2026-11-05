import { messageBytes } from './rpc-budget.mjs';
/** Browser-facing facade; engine/files/HTTP share one project-owner worker. */
export class NativeRuntime {
  #worker; #nextId = 0; #pending = new Map(); #pendingBytes = 0; #closed = false;
  constructor(worker) {
    this.#worker = worker;
    worker.onmessage = ({ data }) => {
      const request = this.#pending.get(data?.id);
      if (!request) return;
      this.#pending.delete(data.id); this.#pendingBytes -= request.bytes; clearTimeout(request.timer);
      if (data.ok) request.resolve(data.value); else request.reject(Object.assign(new Error(data.error), { code: data.code, errno: data.errno, sqlstate: data.sqlstate }));
    };
    worker.onerror = event => this.close(new Error(event.message));
    worker.onmessageerror = () => this.close(new Error('Unreadable runtime message'));
  }
  static async create({ moduleURL, projectKey, vfsLimits, workerURL = new URL('./native-worker.mjs', import.meta.url) }) {
    if(!globalThis.crossOriginIsolated||typeof SharedArrayBuffer==='undefined')throw Error('Le moteur PHP/MariaDB nécessite HTTPS (ou localhost) et les en-têtes COOP/COEP de l’hébergeur.');
    const runtime = new NativeRuntime(new Worker(workerURL, { type: 'module', name: 'wasm-web-server' }));
    try { await runtime.call('initialize', { moduleURL, projectKey, vfsLimits }); return runtime; }
    catch (error) { runtime.close(error); throw error; }
  }
  call(operation, args = {}, timeoutMs = 180000) {
    if (this.#closed) return Promise.reject(new Error('Runtime is closed'));
    if (this.#pending.size >= 64) return Promise.reject(new Error('Too many pending runtime calls'));
    let size;
    try { size=messageBytes({ ...args, operation }); }
    catch(error) { return Promise.reject(error); }
    if(this.#pendingBytes+size>8*1024*1024) return Promise.reject(new Error('Pending runtime calls exceed byte budget'));
    const id = ++this.#nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.close(new Error(`Runtime ${operation} timed out; worker terminated`)), timeoutMs);
      this.#pending.set(id, { resolve, reject, timer, bytes: size }); this.#pendingBytes += size;
      try { this.#worker.postMessage({ ...args, id, operation }); }
      catch (error) { clearTimeout(timer); this.#pending.delete(id); this.#pendingBytes -= size; reject(error); }
    });
  }
  write(path, data) { return this.call('write', { path, data }); }
  async writeNew(path, data) {
    const input = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    if (!(input instanceof Uint8Array)) throw Error('Contenu de fichier invalide.');
    if(input.byteLength<=6*1024*1024)return this.call('write',{path,data:input.byteLength===input.buffer.byteLength?input:input.slice(),expected:null});
    if(input.byteLength>16*1024*1024)throw Error('Fichier supérieur à 16 Mio.');
    const id=await this.call('beginFile',{path,size:input.byteLength});
    try {
      for(let offset=0;offset<input.byteLength;offset+=2*1024*1024)
        await this.call('fileChunk',{upload:id,offset,data:input.slice(offset,Math.min(input.byteLength,offset+2*1024*1024))});
      return await this.call('finishFile',{upload:id});
    } catch(error){await this.call('abortFile',{upload:id}).catch(()=>{});throw error;}
  }
  read(path) { return this.call('read', { path }); }
  list(path = '/workspace') { return this.call('list', { path }); }
  rename(path, target) { return this.call('rename', { path, target }); }
  remove(path) { return this.call('remove', { path }); }
  request(options) { return this.call('request', options); }
  state() { return this.call('state'); }
  sql(sql, database) { return this.call('sql', { sql, database }); }
  sqlScript(statements,database) {return this.call('sqlScript',{statements,database});}
  closeConsole() { return this.call('closeConsole'); }
  get closed() { return this.#closed; }
  metadata() { return this.call('metadata'); }
  save(metadata) { return this.call('save',{metadata}); }
  async shutdown({ save = true, metadata } = {}) { if (save) await this.save(metadata); await this.call('release'); this.close(); }
  stopSQL() { return this.call('stopSQL'); }
  close(error = new Error('Runtime closed')) {
    if (this.#closed) return;
    this.#closed = true; this.#worker.terminate();
    for (const request of this.#pending.values()) { clearTimeout(request.timer); request.reject(error); }
    this.#pending.clear(); this.#pendingBytes=0;
  }
}
