const MAX_DOCUMENT=256*1024,MAX_PENDING=8;
export function offsetAt(text,position){const lines=text.split('\n');let offset=0;for(let i=0;i<Math.min(position.line,lines.length);i++)offset+=lines[i].length+1;return Math.min(text.length,offset+position.character);}
function positionAt(text,offset){const before=text.slice(0,offset),lines=before.split('\n');return {line:lines.length-1,character:lines.at(-1).length};}
export class JavaScriptService{
 constructor(){this.worker=new Worker(new URL('/apps/studio/editor/dist/javascript-worker.mjs',location.href),{type:'module',name:'javascript-types-swc'});this.pending=new Map();this.next=0;this.worker.onmessage=({data})=>{if(data.wasmMemoryBytes)this.memoryBytes=data.wasmMemoryBytes;const request=this.pending.get(data.id);if(!request)return;this.pending.delete(data.id);clearTimeout(request.timer);data.error?request.reject(Error(data.error)):request.resolve(data.result);};this.worker.onerror=event=>this.close(Error(event.message));}
 call(operation,path,text,position,projectDefinitions){if(text.length>MAX_DOCUMENT)return Promise.reject(Error('Analyse limitée à 256 K caractères.'));if(this.pending.size>=MAX_PENDING)return Promise.reject(Error('Trop d’analyses en attente.'));return new Promise((resolve,reject)=>{const id=++this.next;const timer=setTimeout(()=>this.close(Error('Analyse JavaScript expirée. Déchargez puis réactivez l’éditeur.')),20000);this.pending.set(id,{resolve,reject,timer});this.worker.postMessage({id,operation,path:'/project'+path,text,position,projectDefinitions});});}
 close(error=Error('Service arrêté')){this.worker.terminate();for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();}
}
export class LspService{
 constructor(engine,{files={},onDiagnostics=()=>{},onStatus=()=>{}}={}){
  this.engine=engine;this.onDiagnostics=onDiagnostics;this.onStatus=onStatus;this.pending=new Map();this.documents=new Map();this.next=0;this.version=0;this.closed=false;this.output=Promise.resolve();
  this.stdin=new SharedArrayBuffer(16+1024*1024);this.header=new Int32Array(this.stdin,0,4);this.ring=new Uint8Array(this.stdin,16);
  this.worker=new Worker(new URL('/apps/studio/editor/dist/lsp-worker.mjs',location.href),{type:'module',name:engine==='php'?'php-lsp-wasm':'superhtml-wasm'});
  this.worker.onmessage=({data})=>{if(data.log)this.lastLog=(this.lastLog??'').slice(-2048)+data.log;if(data.memoryBytes)this.memoryBytes=data.memoryBytes;if(data.error){this.close(Error(data.error));return;}if(data.message)this.receive(data.message);if(data.exit!==undefined&&!this.closed)this.close(Error(this.engine+' : service arrêté '+data.exit+' '+(this.lastLog??'')));};
  this.worker.onerror=event=>this.close(Error(event.message));this.worker.postMessage({engine,files,stdin:this.stdin});
  this.ready=this.request('initialize',{processId:null,rootUri:'file:///workspace',workspaceFolders:[{uri:'file:///workspace',name:'Projet'}],capabilities:{general:{positionEncodings:['utf-16']},textDocument:{publishDiagnostics:{versionSupport:true},completion:{completionItem:{snippetSupport:false}}}}},30000).then(async result=>{this.capabilities=result.capabilities;await this.notify('initialized',{});if(engine==='php')for(const [path,text]of Object.entries(files).slice(0,64))if(path.endsWith('.php'))await this.updateDocument('file:///workspace'+path,text);});
 }
 receive(message){
  if(this.closed)return;
  if(message.method&&message.id!==undefined){const result=message.method==='workspace/configuration'?(message.params?.items??[]).map(()=>null):null;this.send({jsonrpc:'2.0',id:message.id,result}).catch(error=>this.close(error));return;}
  if(message.method==='textDocument/publishDiagnostics'){
   const {uri,version,diagnostics}=message.params;if(uri!==this.uri||(version!==undefined&&version!==this.version))return;
   this.onDiagnostics((diagnostics??[]).slice(0,60).map(d=>({from:offsetAt(this.text,d.range.start),to:offsetAt(this.text,d.range.end),severity:d.severity===1?'error':'warning',message:d.message.slice(0,1600)})));return;
  }
  const request=this.pending.get(message.id);if(!request)return;clearTimeout(request.timer);this.pending.delete(message.id);message.error?request.reject(Error(message.error.message)):request.resolve(message.result);
 }
 send(message){
  const body=new TextEncoder().encode(JSON.stringify(message)),header=new TextEncoder().encode(`Content-Length: ${body.length}\r\n\r\n`),bytes=new Uint8Array(header.length+body.length);bytes.set(header);bytes.set(body,header.length);
  if(bytes.length>=this.ring.length)return Promise.reject(Error('Message de langage trop volumineux.'));
  this.output=this.output.then(async()=>{const started=performance.now();for(;;){if(this.closed)throw Error('Service de langage fermé.');const write=Atomics.load(this.header,0),read=Atomics.load(this.header,1),free=(read-write-1+this.ring.length)%this.ring.length;if(free>=bytes.length){for(let i=0;i<bytes.length;i++)this.ring[(write+i)%this.ring.length]=bytes[i];Atomics.store(this.header,0,(write+bytes.length)%this.ring.length);Atomics.notify(this.header,0);return;}if(performance.now()-started>5000)throw Error('File de langage saturée. Réactivez l’éditeur.');await new Promise(resolve=>setTimeout(resolve,8));}});return this.output;
 }
 request(method,params,timeout=15000){if(this.pending.size>=MAX_PENDING)return Promise.reject(Error('Trop de requêtes de langage.'));return new Promise((resolve,reject)=>{const id=++this.next,timer=setTimeout(()=>{this.close(Error('Service de langage trop lent. Déchargez puis réactivez l’éditeur.'));},timeout);this.pending.set(id,{resolve,reject,timer});this.send({jsonrpc:'2.0',id,method,params}).catch(error=>{clearTimeout(timer);this.pending.delete(id);reject(error);});});}
 notify(method,params){return this.send({jsonrpc:'2.0',method,params});}
 async updateDocument(uri,text){
  if(text.length>MAX_DOCUMENT)throw Error('Analyse limitée à 256 K caractères.');
  let existing=this.documents.get(uri);
  const retained=()=>[...this.documents].reduce((sum,[name,doc])=>sum+(name===uri?0:doc.text.length),text.length);
  while(this.documents.size>=(existing?65:64)||retained()>1024*1024){const victim=[...this.documents.keys()].find(name=>name!==uri);if(!victim)break;await this.notify('textDocument/didClose',{textDocument:{uri:victim}});this.documents.delete(victim);}
  if(!existing){existing={text,version:1};await this.notify('textDocument/didOpen',{textDocument:{uri,languageId:this.engine==='php'?'php':'html',version:1,text}});}
  else if(existing.text!==text){existing={text,version:existing.version+1};await this.notify('textDocument/didChange',{textDocument:{uri,version:existing.version},contentChanges:[{text}]});}
  this.documents.delete(uri);this.documents.set(uri,existing);return existing;
 }
 async document(path,text){await this.ready;const uri='file:///workspace'+path;this.uri=uri;this.text=text;const document=await this.updateDocument(uri,text);this.version=document.version;}
 async complete(path,text,offset){await this.document(path,text);const result=await this.request('textDocument/completion',{textDocument:{uri:this.uri},position:positionAt(text,offset)});return (Array.isArray(result)?result:result?.items??[]).slice(0,100).map(item=>({label:item.label,type:item.kind===2||item.kind===3?'function':'variable',detail:(item.detail??'').slice(0,400),apply:item.insertTextFormat===2?item.label:item.insertText??item.label}));}
 close(error=Error('Service arrêté')){if(this.closed)return;this.closed=true;Atomics.store(this.header,2,1);Atomics.notify(this.header,0);this.worker.terminate();for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();this.onStatus(error.message);}
}
