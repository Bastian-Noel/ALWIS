/** Real native-runtime memory/latency observations, one fresh browser per sample. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir,writeFile } from 'node:fs/promises';
import { createStudioServer } from '../../scripts/serve-studio.mjs';
import { readBrowserProcessMemory } from '../browser-process-memory.mjs';
const root=resolve(new URL('../..',import.meta.url).pathname);
const { chromium,firefox }=await import(pathToFileURL(resolve(root,'build-work/php/node_modules/playwright/index.mjs')));
const label=process.argv[2]??'current', target=resolve(root,'build-work/native-memory',label); await mkdir(target,{recursive:true});
const server=createStudioServer(); await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
try {
 for(const name of (process.argv[3]??'chromium,firefox').split(',')) {
  const browser=await ({chromium,firefox})[name].launch({headless:true,...(name==='chromium'?{args:['--no-sandbox']}:{})});
  try {
   const page=await browser.newPage(); await page.goto(origin+'/apps/studio/index.html');
   const observations=[];
   async function observe(stage,task) {
    const result=await page.evaluate(task);
    observations.push({stage,...result,processMemory:await readBrowserProcessMemory()});
   }
   await observe('php-only',async()=>{
    const {NativeRuntime}=await import('/packages/runtime/src/native-runtime.mjs');window.rt=await NativeRuntime.create({moduleURL:new URL('/engine/pbl-runtime.mjs',location.href).href});
    await rt.write('/workspace/check.php','<?php echo "pure-php";');
    const start=performance.now();const r=await rt.request({script:'/workspace/check.php'});
    if(new TextDecoder().decode(r.body)!=='pure-php'||r.sqlStarted)throw Error('PHP-only check');
    return {elapsedMs:performance.now()-start,state:await rt.state()};
   });
   await observe('sql-start',async()=>{const start=performance.now();const r=await rt.sql('SELECT 42 AS n','test');if(r.rows[0][0]!=='42')throw Error('SQL check');return {elapsedMs:performance.now()-start,state:await rt.state()};});
   await observe('sql-work',async()=>{
    await rt.sql('CREATE TABLE measurement (id INT PRIMARY KEY, value VARCHAR(200)) ENGINE=InnoDB');
    await rt.sql("INSERT INTO measurement SELECT seq,REPEAT('x',200) FROM seq_1_to_1000");
    const times=[];for(let i=0;i<100;i++){const start=performance.now();const r=await rt.sql('SELECT COUNT(*) AS n FROM measurement');if(r.rows[0][0]!=='1000')throw Error('count');times.push(performance.now()-start);}
    times.sort((a,b)=>a-b);return {latency:{count:times.length,p50:times[50],p95:times[95],max:times[99]},state:await rt.state()};
   });
   await observe('sql-stop',async()=>{const start=performance.now();await rt.closeConsole();await rt.stopSQL();return {elapsedMs:performance.now()-start,state:await rt.state()};});
   await observe('worker-destroyed',async()=>{rt.close();delete window.rt;return {};});
   const receipt={label,browser:name,version:browser.version(),scope:'One fresh browser; Linux aggregate process PSS/RSS separate from WASM linear capacity and allocator usage; observational sample, not a statistical benchmark',observations};
   await writeFile(resolve(target,name+'.json'),JSON.stringify(receipt,null,2)+'\n');
   console.log(name,label,JSON.stringify(observations.map(o=>({stage:o.stage,linear:o.state?.linearMemoryBytes,used:o.state?.allocatorUsedBytes,pss:o.processMemory.pssBytes}))));
  }finally{await browser.close();}
 }
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
