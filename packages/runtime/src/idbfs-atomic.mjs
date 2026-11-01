/** Transaction failure handling for the pinned Emscripten 6.0.6 IDBFS.
 * Its default error handler prevents the request's default abort, and an explicit
 * abort may have error=null. Abort explicitly and settle the owning sync once.
 */
export function enforceAtomicIdbfs(IDBFS,isDirty=()=>false) {
  const getDB=IDBFS.getDB,reconcile=IDBFS.reconcile,wrapped=new WeakSet();let reconciling;
  IDBFS.reconcile=(source,destination,callback)=>{
    // Content may change while mtime stays equal (coarse clocks or explicit touch).
    // Force such entries into this transfer without falsifying stored POSIX times.
    if(source.type==='local'&&destination.type==='remote')for(const [path,entry] of Object.entries(source.entries)){
      const remote=destination.entries[path];if(remote&&isDirty(path)&&entry.timestamp.getTime()===remote.timestamp.getTime())source.entries[path]={...entry,timestamp:new Date(remote.timestamp.getTime()+1)};
    }
    let settled=false;
    const owner={transactions:[],done(error){if(!settled){settled=true;callback(error);}}},previous=reconciling;
    reconciling=owner;
    try{return reconcile.call(IDBFS,source,destination,owner.done);}
    catch(error){for(const tx of owner.transactions)try{tx.abort();}catch{}owner.done(error);}
    finally{reconciling=previous;}
  };
  IDBFS.getDB=(name,callback)=>getDB.call(IDBFS,name,(error,db)=>{
    if(!error&&db&&!wrapped.has(db)){
      const transaction=db.transaction.bind(db);
      db.transaction=(...args)=>{
        if(args[1]==='readwrite')args[2]={...(args[2]??{}),durability:'strict'};
        const tx=transaction(...args),owner=reconciling;
        if(tx.mode==='readwrite'){
          if(owner){owner.transactions.push(tx);tx.addEventListener('abort',()=>owner.done(tx.error??new DOMException('Project storage transaction aborted','AbortError')),{once:true});}
          tx.addEventListener('error',()=>{try{tx.abort();}catch{/* It may already have aborted. */}},{capture:true});
        }
        return tx;
      };
      wrapped.add(db);
    }
    callback(error,db);
  });
}
