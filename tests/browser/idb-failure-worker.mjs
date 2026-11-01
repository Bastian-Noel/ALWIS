/** Test-only: fail a write transaction after a real put has succeeded.
 * Production server doesn't serve this worker. The engine/data are never mocked.
 */
let duplicatePath,successfulWrites=0;
const put=IDBObjectStore.prototype.put;
IDBObjectStore.prototype.put=function(...args){
  const request=put.apply(this,args);
  if(duplicatePath&&this.transaction.db.name.includes('/.pbl/projects/@v2/')&&this.name==='FILE_DATA'&&this.transaction.mode==='readwrite'){
    const path=duplicatePath;duplicatePath=null;
    request.addEventListener('success',()=>{successfulWrites++;this.add({timestamp:new Date(),mode:33188,contents:new Uint8Array()},path);});
  }
  return request;
};
const dispatch=self.onmessage;
if(typeof dispatch!=='function')throw Error('Native test worker was not initialized');
self.onmessage=event=>{
  const operation=event.data?.operation;
  if(operation==='test-arm-failure'||operation==='test-injected-state'){
    if(operation==='test-arm-failure')duplicatePath=event.data.path;
    self.postMessage({id:event.data.id,ok:true,value:{armed:!!duplicatePath,successfulWrites}});return;
  }
  return dispatch.call(self,event);
};
import '/packages/runtime/src/native-worker.mjs';
