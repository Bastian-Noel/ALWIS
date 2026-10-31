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
const server=createStudioServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
try{
 for(const name of (process.argv[2]??'chromium,firefox').split(',')){
  const browser=await playwright[name].launch({headless:true,...(name==='chromium'?{args:['--no-sandbox']}:{})});
  try{
   const studio=await browser.newPage();studio.setDefaultTimeout(180000);
   await studio.goto(origin+'/?project=load-'+crypto.randomUUID());await studio.locator('#status').filter({hasText:'Prêt à ouvrir'}).waitFor();
   await studio.locator('#open').click();await studio.locator('#status').filter({hasText:'Projet prêt.'}).waitFor();
   await studio.locator('#import-files').setInputFiles([{name:'load.php',mimeType:'text/plain',buffer:fixture},{name:'client.html',mimeType:'text/html',buffer:Buffer.from('<!doctype html><html><head><title>Load client</title></head><body><h1 id=load-client>Client de charge</h1></body></html>')}]);await studio.locator('#status').filter({hasText:'Fichiers importés.'}).waitFor();
   await studio.locator('#preview-path').fill('/client.html');
   async function client(){const pending=studio.waitForEvent('popup');await studio.locator('#new-client').click();const page=await pending;await page.waitForSelector('#load-client');return page;}
   const clients=[await client(),await client()];const stages=[];
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
    stages.push({ratePerClient:rate,durationMs:10000,memoryBefore,memoryAfter,engineLabel:await studio.locator('#engine-state').textContent(),linearMemoryBytes:Number(await studio.locator('#engine-state').getAttribute('data-linear-memory-bytes')),allocatorUsedBytes:Number(await studio.locator('#engine-state').getAttribute('data-allocator-used-bytes')),clients:results.map(({responses,...r})=>({...r,session:responses[0].session,first:responses[0],last:responses.at(-1)}))});
    console.log(name,rate,'requests/s/client passed');
   }
   await studio.locator('#close').click();await studio.locator('#status').filter({hasText:'Projet fermé'}).waitFor();
   await writeFile(resolve(output,name+'.json'),JSON.stringify({browser:name,version:browser.version(),passed:true,scope:'Two clients; 10 seconds per stage. Short sustained scenario, not a leak endurance proof.',stages},null,2)+'\n');
  }finally{await browser.close();}
 }
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
