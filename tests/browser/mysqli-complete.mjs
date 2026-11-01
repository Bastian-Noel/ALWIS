/** Added native MySQLi APIs and explicit platform policies, in actual browsers. */
import assert from 'node:assert/strict';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {createHash} from 'node:crypto';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';import {createStudioServer} from '../../scripts/serve-studio.mjs';
const root=resolve(new URL('../..',import.meta.url).pathname),pw=await import(pathToFileURL(resolve(root,'build-work/php/node_modules/playwright/index.mjs')).href),fixture=await readFile(resolve(root,'fixtures/compatibility/mysqli-complete.php'),'utf8');
const wasmSha256=createHash('sha256').update(await readFile(resolve(root,'build-work/bridge/.native-build/engine/wasm/runtime-dist/pbl-runtime.wasm'))).digest('hex');
const server=createStudioServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{for(const name of(process.argv[2]??'chromium,firefox').split(',')){
 const browser=await pw[name].launch({headless:true,...(name==='chromium'?{args:['--no-sandbox']}:{})});try{
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);
 const result=await page.evaluate(async code=>{const {NativeRuntime}=await import('/packages/runtime/src/native-runtime.mjs');const rt=await NativeRuntime.create({moduleURL:new URL('/engine/pbl-runtime.mjs',location.href).href});try{await rt.write('/workspace/complete.php',code);const response=await rt.request({script:'/workspace/complete.php'});return {exitCode:response.exitCode,body:new TextDecoder().decode(response.body),stderr:new TextDecoder().decode(response.stderr),state:await rt.state()};}finally{rt.close();}},fixture);
 assert.equal(result.exitCode,0,result.stderr);assert.equal(result.stderr,'');const data=JSON.parse(result.body);assert.equal(data.registered.length,106);assert.equal(data.ok,true);assert.equal(result.state.sqlConnections,0);assert.equal(result.state.nativeStatements,0);assert.equal(result.state.preparedSQLReservedBytes,0);
 await mkdir(resolve(root,'engine/fusion/receipts/mysqli-complete'),{recursive:true});await writeFile(resolve(root,`engine/fusion/receipts/mysqli-complete/${name}.json`),JSON.stringify({passed:true,browser:name,version:browser.version(),wasmSha256,...data,state:result.state},null,2)+'\n');console.log(name,'106 MySQLi entries, added APIs, budgets and platform policies passed');
 }finally{await browser.close();}
}}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
