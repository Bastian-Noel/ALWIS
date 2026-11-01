/** Emscripten 6.0.6 MEMFS/IDBFS quotas, below PHP and native SQL POSIX calls.
 * Byte budgets count logical file data; MEMFS allocation capacity is reported separately.
 */
const MiB=1024*1024;
export function installVfsQuota(FS,{projectRoot='/workspace',sqlRoot='/mariadb/data',limits={}}={}) {
  const defaults={projectBytes:64*MiB,projectFileBytes:16*MiB,projectNodes:2048,tempBytes:16*MiB,tempFileBytes:16*MiB,tempNodes:256,sqlBytes:128*MiB,sqlFileBytes:64*MiB,sqlNodes:4096,systemBytes:16*MiB,systemFileBytes:16*MiB,systemNodes:2048,openFiles:512};
  for(const [key,value] of Object.entries(limits))if(!Object.hasOwn(defaults,key)||!Number.isSafeInteger(value)||value<1||value>defaults[key])throw Error('Invalid VFS limit: '+key);
  const policy={...defaults,...limits},records=new WeakMap();let dirty=new WeakSet();
  const groups=Object.fromEntries(['project','temp','sql','system'].map(name=>[name,{bytes:0,reserved:0,nodes:0,maxBytes:policy[name+'Bytes'],maxFileBytes:policy[name+'FileBytes'],maxNodes:policy[name+'Nodes']} ]));
  const under=(path,root)=>path===root||path.startsWith(root+'/');
  const groupFor=path=>under(path,projectRoot)||under(path,'/workspace')?'project':under(path,sqlRoot)||under(path,'/mariadb/data')?'sql':under(path,'/tmp')?'temp':'system';
  const fail=(errno=51)=>{throw new FS.ErrnoError(errno);}; // Emscripten/WASI ENOSPC=51, EMFILE=33.
  const size=node=>FS.isFile(node.mode)?node.usedBytes??node.node_ops?.getattr?.(node)?.size??0:0;
  const reserved=node=>FS.isFile(node.mode)?node.contents?.buffer?.byteLength??size(node):0;
  function check(name,bytes,nodes=0,fileBytes=0){
    if(!name)return;const group=groups[name];
    if(!Number.isSafeInteger(bytes)||fileBytes>group.maxFileBytes||group.bytes+bytes>group.maxBytes||group.nodes+nodes>group.maxNodes)fail();
  }
  function record(node,path){
    let rec=records.get(node);if(rec)return rec;path??=FS.getPath(node);
    const group=groupFor(path),bytes=size(node),capacity=reserved(node);check(group,bytes,1,bytes);
    rec={group,bytes,reserved:capacity,deleted:false};records.set(node,rec);
    if(group){groups[group].bytes+=bytes;groups[group].reserved+=capacity;groups[group].nodes++;}return rec;
  }
  function refresh(node){
    dirty.add(node);
    const rec=record(node),bytes=size(node),capacity=reserved(node);
    if(rec.group){groups[rec.group].bytes+=bytes-rec.bytes;groups[rec.group].reserved+=capacity-rec.reserved;}
    rec.bytes=bytes;rec.reserved=capacity;
  }
  function growth(node,next){const rec=record(node);if(!Number.isSafeInteger(next)||next<0)fail();check(rec.group,Math.max(0,next-rec.bytes),0,next);}
  const opened=node=>FS.streams.some(stream=>stream?.node===node);
  function release(node){
    const rec=records.get(node);if(!rec)return;rec.deleted=true;
    if(opened(node))return;
    if(rec.group){groups[rec.group].bytes-=rec.bytes;groups[rec.group].reserved-=rec.reserved;groups[rec.group].nodes--;rec.group=null;}
  }
  function scan(path){
    let node;try{node=FS.lookupPath(path,{follow:true}).node;}catch(error){if(error.errno===44)return;throw error;}
    const visit=node=>{record(node);if(FS.isDir(node.mode))for(const child of Object.values(node.contents??{}))visit(child);};visit(node);
  }
  const original={};
  function wrap(name,handler){if(typeof FS[name]!=='function')throw Error('Unsupported Emscripten FS hook: '+name);original[name]=FS[name];FS[name]=function(...args){return handler(original[name],...args);};}
  for(const root of new Set(['/',projectRoot,sqlRoot,'/tmp']))scan(root);
  wrap('createNode',(fn,parent,name,mode,dev)=>{
    if(parent){if(name.length>255||new TextEncoder().encode(name).length>255)fail(37);check(groupFor(FS.getPath(parent).replace(/\/$/,'')+'/'+name),0,1);}
    const node=fn.call(FS,parent,name,mode,dev);if(parent){record(node);dirty.add(node);}return node;
  });
  wrap('write',(fn,stream,buffer,offset,length,position,canOwn)=>{
    if(FS.isFile(stream.node.mode)&&length>=0){const at=position??((stream.flags&1024)?size(stream.node):stream.position);growth(stream.node,Math.max(size(stream.node),at+length));}
    try{return fn.call(FS,stream,buffer,offset,length,position,canOwn);}finally{refresh(stream.node);}
  });
  wrap('doSetAttr',(fn,stream,node,attr)=>{
    if(attr.size!==undefined)growth(node,attr.size);
    try{return fn.call(FS,stream,node,attr);}finally{dirty.add(node);if(attr.size!==undefined)refresh(node);}
  });
  wrap('msync',(fn,stream,buffer,offset,length,flags)=>{
    // MAP_PRIVATE (2) does not alter the file.
    if(!(flags&2))growth(stream.node,Math.max(size(stream.node),offset+length));
    try{return fn.call(FS,stream,buffer,offset,length,flags);}finally{refresh(stream.node);}
  });
  wrap('open',(fn,...args)=>{if(FS.streams.filter(Boolean).length>=policy.openFiles)fail(33);return fn.apply(FS,args);});
  wrap('close',(fn,stream)=>{const node=stream.node;try{return fn.call(FS,stream);}finally{if(node&&records.get(node)?.deleted)release(node);}});
  for(const name of ['unlink','rmdir'])wrap(name,(fn,path)=>{const node=FS.lookupPath(path,{follow:false}).node;const value=fn.call(FS,path);release(node);return value;});
  wrap('symlink',(fn,target,path)=>{if(target.length>4096||new TextEncoder().encode(target).length>4096)fail(37);return fn.call(FS,target,path);});
  wrap('rename',(fn,from,to)=>{
    const node=FS.lookupPath(from,{follow:false}).node,moves=[],deltas={};let destination;
    try{destination=FS.lookupPath(to,{follow:false}).node;}catch(error){if(error.errno!==44)throw error;}
    const visit=(node,path)=>{
      const rec=record(node),group=groupFor(path);moves.push({node,rec,group});
      if(group!==rec.group){if(group){deltas[group]??={bytes:0,nodes:0};deltas[group].bytes+=rec.bytes;deltas[group].nodes++;if(rec.bytes>groups[group].maxFileBytes)fail();}
        if(rec.group){deltas[rec.group]??={bytes:0,nodes:0};deltas[rec.group].bytes-=rec.bytes;deltas[rec.group].nodes--;}}
      if(FS.isDir(node.mode))for(const [name,child] of Object.entries(node.contents??{}))visit(child,path.replace(/\/$/,'')+'/'+name);
    };
    // Resolve the destination parent so a symlink cannot evade category accounting.
    const split=to.lastIndexOf('/'),parent=FS.lookupPath(to.slice(0,split)||'/',{follow:true}).node;
    visit(node,FS.getPath(parent).replace(/\/$/,'')+'/'+to.slice(split+1));
    for(const [group,delta] of Object.entries(deltas))check(group,delta.bytes,delta.nodes);
    const result=fn.call(FS,from,to);for(const move of moves)dirty.add(move.node);
    if(destination&&destination!==node)release(destination);
    for(const {rec,group} of moves)if(rec.group!==group){if(rec.group){groups[rec.group].bytes-=rec.bytes;groups[rec.group].reserved-=rec.reserved;groups[rec.group].nodes--;}
      if(group){groups[group].bytes+=rec.bytes;groups[group].reserved+=rec.reserved;groups[group].nodes++;}rec.group=group;}
    return result;
  });
  return {scan,isDirty(path){try{return dirty.has(FS.lookupPath(path,{follow:false}).node);}catch{return false;}},clearDirty(){dirty=new WeakSet();},stats:()=>({groups:Object.fromEntries(Object.entries(groups).map(([name,value])=>[name,{...value}])),openFiles:FS.streams.filter(Boolean).length,maxOpenFiles:policy.openFiles})};
}
