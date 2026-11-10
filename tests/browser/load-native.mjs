import {waitForAsyncCondition} from './async-condition.mjs';
/** Two virtual HTTP clients, fixed offered 5/10 requests/s each, one in flight each. */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createStudioServer} from '../../scripts/serve-studio.mjs';
import {readBrowserProcessMemory} from '../../benchmarks/browser-process-memory.mjs';
const root=resolve(new URL('../..',import.meta.url).pathname),output=resolve(root,'build-work/native-load');await mkdir(output,{recursive:true});
const playwright=await import(pathToFileURL(resolve(root,'build-work/php/node_modules/playwright/index.mjs')));
const fixture=await readFile(resolve(root,'fixtures/compatibility/load.php'));
const server=createStudioServer(process.env.ALWIS_PARITY_RUNTIME_DIST ? {engineDist:resolve(process.env.ALWIS_PARITY_RUNTIME_DIST)} : {});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
try{
 for(const name of (process.argv[2]??'chromium,firefox').split(',')){
  const browser=await playwright[name].launch({headless:true,...(name==='chromium'?{args:['--no-sandbox']}:{})});
  try{
   const context=await browser.newContext();const studio=await context.newPage();studio.setDefaultTimeout(60000);
   const project='load-'+crypto.randomUUID();
   await studio.goto(origin+'/?project='+project);
   await waitForAsyncCondition(studio, async name=>{
    const {S}=await import('/apps/studio/workbench/state.mjs');
    return S.mode==='launcher' && document.querySelector('#pn')?.value===name &&
      S.logs.some(row=>row.msg==='ALWIS prêt');
   },project,{timeout:30000});
   // Load testing requires a fresh project, not the school demo's 14-table
   // initialization or a CodeMirror editor. Neither is part of HTTP load.
   await studio.locator('input[name=tpl][value=empty]').check();
   await studio.locator('[data-act=create]').click();
   try {
    await waitForAsyncCondition(studio, async name=>{
     const {S}=await import('/apps/studio/workbench/state.mjs');
     return S.mode==='work' && S.project===name;
    },project,{timeout:60000});
   } catch(error) {
    const state=await studio.evaluate(async()=>{
     const {S}=await import('/apps/studio/workbench/state.mjs');
     return {mode:S.mode,project:S.project,lamp:S.lamp,alert:S.alert,
       logs:S.logs.slice(-6).map(x=>({level:x.l,msg:x.msg,detail:x.detail}))};
    });
    throw Error('Load fixture project did not open: '+JSON.stringify(state),{cause:error});
   }
   await studio.locator('#zipIn').setInputFiles([{name:'load.php',mimeType:'text/plain',buffer:fixture},{name:'client.html',mimeType:'text/html',buffer:Buffer.from('<!doctype html><html><head><title>Load client</title></head><body><h1 id=load-client>Client de charge</h1></body></html>')}]);
   // Toasts are ephemeral and may disappear before Playwright starts waiting.
   // Verify the real imported files instead of a transient UI notification.
   try {
    await waitForAsyncCondition(studio, async()=>{
     const {ctx}=await import('/apps/studio/workbench/state.mjs');
     if (!ctx.engine?.fs) return false;
     try {
      const files=await ctx.engine.fs.list();
      return files.some(f=>f.path==='/load.php') && files.some(f=>f.path==='/client.html');
     } catch { return false; }
    },null,{timeout:30000});
   } catch(error) {
    const diagnosis=await studio.evaluate(async()=>{
     const {S,ctx}=await import('/apps/studio/workbench/state.mjs');
     let files,fsError;
     try { files=(await ctx.engine.fs.list()).map(f=>f.path).slice(0,30); }
     catch(e) { fsError=e?.message; }
     return {mode:S.mode,project:S.project,alert:S.alert,files,fsError,
       logs:S.logs.slice(-12).map(({l,msg,detail})=>({l,msg,detail}))};
    });
    throw Error('Load test fixture import did not produce both files: '+
      JSON.stringify(diagnosis),{cause:error});
   }
   // The load scenario tests two distinct real HTTP sessions, not popup
   // timing. window.open() inside page.evaluate() depends on browser
   // user-activation rules and can race studio navigation/initialization.
   // Create sessions from the live host and navigate two pages in the SAME
   // browser context (the installed Service Worker belongs to that context).
   await waitForAsyncCondition(studio, async()=>{
    const {S,ctx}=await import('/apps/studio/workbench/state.mjs');
    return S.mode==='work' && ctx.engine?.sessions?.list()?.length>0 &&
      !!navigator.serviceWorker?.controller;
   },null,{timeout:30000});
   const routes=await studio.evaluate(async()=>{
    const {S,eng}=await import('/apps/studio/workbench/state.mjs');
    const sessions=eng().sessions;
    try {
     if(S.mode!=='work'||!S.project||!eng().env().persistent||sessions.list().length===0)
      throw Error('Studio state changed before load sessions were created');
     const ids=await sessions.createMany(['Charge A','Charge B']);
     if(ids.length!==2||ids[0]===ids[1])throw Error('Two unique HTTP sessions required');
     return ids.map(id=>sessions.routeURL(id,'/client.html'));
    } catch(error) {
     throw Error(JSON.stringify({message:error?.message,mode:S.mode,project:S.project,
      persistent:eng().env().persistent,sessionCount:sessions.list().length,
      logs:S.logs.slice(-6).map(({l,msg})=>({l,msg}))}),{cause:error});
    }
   });
   async function client(route){
    const page=await context.newPage();
    await page.goto(origin+route);
    await page.waitForSelector('#load-client',{timeout:30000});
    return page;
   }
   const clients=[await client(routes[0]),await client(routes[1])];const stages=[];
   for(const rate of [5,10]){
    const memoryBefore=await readBrowserProcessMemory();
    const results=await Promise.all(clients.map(page=>page.evaluate(async rate=>{
     const duration=10000,interval=1000/rate,start=performance.now(),latencies=[],responses=[];let delayed=0;
     for(let i=0;i<duration/interval;i++){
      const expected=start+i*interval,wait=expected-performance.now();if(wait>0)await new Promise(r=>setTimeout(r,wait));else if(wait<-interval)delayed++;
      const begin=performance.now(),response=await fetch('/load.php');if(!response.ok)throw Error('HTTP '+response.status);const body=await response.json();latencies.push(performance.now()-begin);responses.push(body);
     }
     return {offeredRate:rate,completed:latencies.length,elapsedMs:performance.now()-start,delayed,latencies,responses};
    },rate)));
    const ids=results.map(r=>r.responses[0].session);assert.notEqual(ids[0],ids[1]);
    const shared=results.flatMap(r=>r.responses.map(v=>v.shared));assert.equal(new Set(shared).size,shared.length);
    for(const r of results)for(let i=1;i<r.responses.length;i++)assert.equal(r.responses[i].calls,r.responses[i-1].calls+1);
    const memoryAfter=await readBrowserProcessMemory();
    stages.push({ratePerClient:rate,durationMs:10000,memoryBefore,memoryAfter,engine:await studio.evaluate(async()=>{const {ctx}=await import('/apps/studio/workbench/state.mjs');await ctx.engine.measure();return ctx.engine.memory().raw;}),clients:results.map(({responses,...r})=>({...r,session:responses[0].session,first:responses[0],last:responses.at(-1)}))});
    console.log(name,rate,'requests/s/client passed');
   }
   await studio.evaluate(async()=>{const {A}=await import('/apps/studio/workbench/state.mjs');await A.save();await A.close();});
   await writeFile(resolve(output,name+'.json'),JSON.stringify({browser:name,version:browser.version(),passed:true,scope:'Two clients; 10 seconds per stage. Short sustained scenario, not a leak endurance proof.',stages},null,2)+'\n');
  }finally{await browser.close();}
 }
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
