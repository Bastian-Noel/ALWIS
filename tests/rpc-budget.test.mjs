import assert from 'node:assert/strict';
import {test} from 'node:test';
import {messageBytes} from '../packages/runtime/src/rpc-budget.mjs';
import {NativeRuntime} from '../packages/runtime/src/native-runtime.mjs';
test('RPC accounts UTF8 and binary before cloning, rejects cycles/oversized/deep metadata',()=>{
 assert.equal(messageBytes('é🎲'),6);assert.equal(messageBytes(Uint8Array.of(1,2,3)),3);
 assert.throws(()=>messageBytes('x'.repeat(100),99),/byte budget/);
 const cyclic={};cyclic.self=cyclic;assert.throws(()=>messageBytes(cyclic),/Cyclic/);
 let deep={};for(let i=0;i<20;i++)deep={deep};assert.throws(()=>messageBytes(deep),/metadata/);
});
test('Facade bounds aggregate pending bytes and releases them after responses and clone failures',async()=>{
 const sent=[];let fail=false;
 const worker={postMessage(value){if(fail)throw Error('clone failed');sent.push(value);},terminate(){}};
 const runtime=new NativeRuntime(worker);const data=new Uint8Array(5*1024*1024);
 const first=runtime.write('/workspace/one',data);
 await assert.rejects(runtime.write('/workspace/two',data),/Pending.*byte budget/);
 assert.equal(sent.length,1);worker.onmessage({data:{id:sent[0].id,ok:true,value:'done'}});await first;
 fail=true;await assert.rejects(runtime.write('/workspace/fail',data),/clone failed/);fail=false;
 const second=runtime.write('/workspace/two',data);worker.onmessage({data:{id:sent[1].id,ok:true,value:'done'}});await second;runtime.close();
});
