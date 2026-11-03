import test from 'node:test';
import assert from 'node:assert/strict';
import {schemaLayout} from '../apps/studio/workbench/schema-layout.mjs';
import {folderWriter,readFolder} from '../apps/studio/workbench/folder-access.mjs';
test('schema orders dependencies, avoids collisions and handles cycles deterministically',()=>{
 const tables=[{name:'child',columns:Array(8),fks:[{refTable:'parent'}]},{name:'parent',columns:[],fks:[]},{name:'other',columns:[],fks:[{refTable:'parent'}]},{name:'a',columns:[],fks:[{refTable:'b'}]},{name:'b',columns:[],fks:[{refTable:'a'}]}];
 const pos=schemaLayout(tables);assert.deepEqual(pos,schemaLayout([...tables].reverse()));assert.ok(pos.child[0]>pos.parent[0]);
 for(const a of tables)for(const b of tables)if(a!==b&&pos[a.name][0]===pos[b.name][0]){const [top,bottom]=pos[a.name][1]<pos[b.name][1]?[a,b]:[b,a];assert.ok(pos[bottom.name][1]>=pos[top.name][1]+46+26*top.columns.length);}
});
test('folder saves refuse external modifications and deleted files',async()=>{
 let content='old',exists=true,writes=0;
 const handle={getFile:async()=>new Blob([content]),createWritable:async()=>({write:async text=>{content=text;writes++},close:async()=>{}})};
 const directory={getFileHandle:async()=>{if(!exists)throw Object.assign(Error(),{name:'NotFoundError'});return handle;}};
 const snapshots=new Map([['/index.php',new TextEncoder().encode('old')]]),write=folderWriter(directory,snapshots);
 await write('/index.php','saved');assert.equal(content,'saved');content='external';await assert.rejects(write('/index.php','overwrite'),/a changé/);assert.equal(writes,1);
 exists=false;await assert.rejects(write('/index.php','recreate'),/a changé/);
 await assert.rejects(write('/../secret','x'),/réservé/);
});
test('folder imports binary files and skips dependencies and hidden entries',async()=>{
 const directory={async *entries(){yield ['.git',{kind:'directory'}];yield ['vendor',{kind:'directory'}];yield ['image.bin',{kind:'file',getFile:async()=>new Blob([new Uint8Array([0,255])])}];}};
 const files=await readFolder(directory);assert.deepEqual([...files.keys()],['/image.bin']);assert.deepEqual([...files.get('/image.bin')],[0,255]);
});
test('folder context commits metadata last and refuses external changes',async()=>{
 const {folderContext}=await import('../apps/studio/workbench/folder-access.mjs');
 const files=new Map(),order=[];
 const missing=()=>Object.assign(Error('Missing'),{name:'NotFoundError'});
 const dir={getFileHandle:async(name,options)=>{
  if(!files.has(name)&&!options?.create)throw missing();
  return {getFile:async()=>new Blob([files.get(name)??'']),createWritable:async()=>{let pending;return {write:async data=>{pending=data;},close:async()=>{order.push(name);files.set(name,pending);},abort:async()=>{}};}};
 },removeEntry:async name=>files.delete(name)};
 const context=await folderContext({getDirectoryHandle:async()=>dir});
 await context.save({tabs:['/index.php'],query:'SELECT 42'},new Uint8Array([1,2]));
 assert.equal(order.at(-1),'context.json');
 const saved=JSON.parse(files.get('context.json'));assert.equal(saved.workspace.query,'SELECT 42');assert.ok(files.has(saved.archive));
 files.set('context.json','external');
 await assert.rejects(context.save({},new Uint8Array()),/a changé/);assert.equal(files.get('context.json'),'external');
});
