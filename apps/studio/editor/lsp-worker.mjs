import {WASI,Fd,ConsoleStdout,PreopenDirectory,Directory,File,wasi} from '@bjorn3/browser_wasi_shim';
// A bounded SPSC stdin ring allows synchronous WASI fd_read without blocking UI.
self.onmessage=async({data})=>{
 try{
  const header=new Int32Array(data.stdin,0,4),ring=new Uint8Array(data.stdin,16),capacity=ring.length;
  const wait=()=>{while(Atomics.load(header,0)===Atomics.load(header,1)){if(Atomics.load(header,2))return false;Atomics.wait(header,0,Atomics.load(header,0),30000);}return true;};
  class Input extends Fd{
   fd_fdstat_get(){return {ret:0,fdstat:new wasi.Fdstat(wasi.FILETYPE_CHARACTER_DEVICE,0)};}
   fd_read(size){if(!wait())return {ret:0,data:new Uint8Array()};const read=Atomics.load(header,1),write=Atomics.load(header,0),count=Math.min(size,(write-read+capacity)%capacity),output=new Uint8Array(count);for(let i=0;i<count;i++)output[i]=ring[(read+i)%capacity];Atomics.store(header,1,(read+count)%capacity);return {ret:0,data:output};}
  }
  let stdout=new Uint8Array();
  const send=chunk=>{
   if(stdout.length+chunk.length>2*1024*1024)throw Error('Réponse LSP supérieure à 2 Mio. Réduisez le document.');
   const merged=new Uint8Array(stdout.length+chunk.length);merged.set(stdout);merged.set(chunk,stdout.length);stdout=merged;
   for(;;){let split=-1;for(let i=0;i+3<stdout.length;i++)if(stdout[i]===13&&stdout[i+1]===10&&stdout[i+2]===13&&stdout[i+3]===10){split=i;break;}if(split<0)return;
    const headerText=new TextDecoder().decode(stdout.subarray(0,split)),length=Number(/Content-Length:\s*(\d+)/i.exec(headerText)?.[1]);if(!Number.isSafeInteger(length)||length>2*1024*1024)throw Error('En-tête LSP invalide.');if(stdout.length<split+4+length)return;
    const message=JSON.parse(new TextDecoder().decode(stdout.subarray(split+4,split+4+length)));stdout=stdout.slice(split+4+length);self.postMessage({message});
   }
  };
  const root=new Directory(new Map([['workspace',new Directory(new Map())]]));
  for(const [path,text]of Object.entries(data.files??{}).slice(0,64)){
   const parts=path.replace(/^\//,'').split('/');let dir=root.contents.get('workspace');for(const part of parts.slice(0,-1)){if(!dir.contents.has(part))dir.contents.set(part,new Directory(new Map()));dir=dir.contents.get(part);}dir.contents.set(parts.at(-1),new File(new TextEncoder().encode(text)));
  }
  const host=new WASI([data.engine==='php'?'phpantom_lsp':'superhtml'],['PWD=/workspace','HOME=/workspace'],[new Input(),new ConsoleStdout(send),ConsoleStdout.lineBuffered(text=>self.postMessage({log:text.slice(0,2048)})),new PreopenDirectory('/',root.contents)]);
  const module=await WebAssembly.compileStreaming(fetch(new URL(data.engine==='php'?'./php-lsp.wasm':'./superhtml.wasm',import.meta.url)));
  let instance;
  // Both official WASI builds use fd_read; support a readiness poll as well.
  host.wasiImport.poll_oneoff=(input,output,count,events)=>{
   const view=new DataView(instance.exports.memory.buffer);
   for(let i=0;i<count;i++){const offset=input+i*48,type=view.getUint8(offset+8);if(type===1){wait();view.setBigUint64(output,view.getBigUint64(offset,true),true);view.setUint16(output+8,0,true);view.setUint8(output+10,1);view.setBigUint64(output+16,BigInt((Atomics.load(header,0)-Atomics.load(header,1)+capacity)%capacity),true);view.setUint16(output+24,0,true);view.setUint32(events,1,true);return 0;}}
   return wasi.ERRNO_NOTSUP;
  };
  instance=await WebAssembly.instantiate(module,{wasi_snapshot_preview1:host.wasiImport});
  self.postMessage({ready:true,memoryBytes:instance.exports.memory.buffer.byteLength});
  if(data.engine==='php'){
   host.initialize(instance);let input=new Uint8Array();const stream=new Input();
   while(wait()){
    const chunk=stream.fd_read(1024*1024).data,merged=new Uint8Array(input.length+chunk.length);merged.set(input);merged.set(chunk,input.length);input=merged;
    for(;;){let split=-1;for(let i=0;i+3<input.length;i++)if(input[i]===13&&input[i+1]===10&&input[i+2]===13&&input[i+3]===10){split=i;break;}if(split<0)break;
     const length=Number(/Content-Length:\s*(\d+)/i.exec(new TextDecoder().decode(input.subarray(0,split)))?.[1]);if(length>1024*1024)throw Error('Message PHP LSP excessif.');if(input.length<split+4+length)break;
     const bytes=input.slice(split+4,split+4+length);input=input.slice(split+4+length);const exports=instance.exports,ptr=exports.lsp_alloc(bytes.length);let reply=0,replyLength=0;
     try{new Uint8Array(exports.memory.buffer,ptr,bytes.length).set(bytes);reply=exports.lsp_handle(ptr,bytes.length);replyLength=exports.lsp_response_len();if(replyLength>2*1024*1024)throw Error('Réponse PHP LSP excessive.');if(reply&&replyLength)self.postMessage({message:JSON.parse(new TextDecoder().decode(new Uint8Array(exports.memory.buffer,reply,replyLength))),memoryBytes:exports.memory.buffer.byteLength});}
     finally{exports.lsp_dealloc(ptr,bytes.length);if(reply)exports.lsp_dealloc(reply,replyLength);}
    }
   }
  }else{const code=host.start(instance);self.postMessage({exit:code});}
 }catch(error){self.postMessage({error:String(error.message??error)});}
};
