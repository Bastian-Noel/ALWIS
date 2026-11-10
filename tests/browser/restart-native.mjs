/** Cross-process persistence and forced browser interruption with a private profile. */
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createStudioServer} from '../../scripts/serve-studio.mjs';
const root=resolve(new URL('../..',import.meta.url).pathname),output=resolve(root,'build-work/native-restart');await mkdir(output,{recursive:true});
const playwright=await import(pathToFileURL(resolve(root,'build-work/php/node_modules/playwright/index.mjs')));
const server=createStudioServer(process.env.ALWIS_PARITY_RUNTIME_DIST ? {engineDist:resolve(process.env.ALWIS_PARITY_RUNTIME_DIST)} : {});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
async function ownedBrowserPid(profile){
 const matches=[];
 for(const entry of await readdir('/proc'))if(/^\d+$/.test(entry))try{
  const status=await readFile('/proc/'+entry+'/status','utf8');if(Number(status.match(/^PPid:\s+(\d+)/m)?.[1])!==process.pid)continue;
  const args=await readFile('/proc/'+entry+'/cmdline','utf8');if(args.includes(profile))matches.push(Number(entry));
 }catch{/* Another process may exit during enumeration. */}
 assert.equal(matches.length,1,'Expected exactly one owned browser root with the private test profile');return matches[0];
}
try{
 for(const name of (process.argv[2]??'chromium,firefox').split(',')){
  const profile=await mkdtemp(resolve(output,name+'-profile-')),projectKey='restart-'+crypto.randomUUID();let context;
  const launch=async()=>{context=await playwright[name].launchPersistentContext(profile,{headless:true,...(name==='chromium'?{args:['--no-sandbox']}:{})});const page=context.pages()[0]??await context.newPage();await page.goto(origin+'/apps/studio/index.html');return page;};
  const options={moduleURL:origin+'/engine/pbl-runtime.mjs',projectKey};let version;
  try{
   let page=await launch();version=context.browser()?.version();
   await page.evaluate(async options=>{
    const {NativeRuntime}=await import('/packages/runtime/src/native-runtime.mjs');const rt=await NativeRuntime.create(options);
    await rt.write('/workspace/value.txt','committed-files');
    await rt.write('/workspace/check.php',`<?php $db=new PDO('mysql:dbname=test','root','');echo file_get_contents(__DIR__.'/value.txt').'|'.$db->query('SELECT value FROM restart_value')->fetchColumn();`);
    await rt.sql('CREATE TABLE restart_value(value VARCHAR(40))','test');await rt.sql("INSERT INTO restart_value VALUES('committed-sql')");
    await rt.shutdown({metadata:{version:'committed-metadata'}});
   },options);
   await context.close();page=await launch();
   const reopened=await page.evaluate(async options=>{
    const {NativeRuntime}=await import('/packages/runtime/src/native-runtime.mjs');window.rt=await NativeRuntime.create(options);
    const response=await rt.request({script:'/workspace/check.php'});if(response.exitCode!==0)throw Error(new TextDecoder().decode(response.stderr));
    return {body:new TextDecoder().decode(response.body),metadata:await rt.metadata(),state:await rt.state()};
   },options);
   assert.equal(reopened.body,'committed-files|committed-sql');assert.equal(reopened.metadata.version,'committed-metadata');
   const pending=await page.evaluate(async()=>{await rt.write('/workspace/value.txt','unsaved-files');await rt.sql("UPDATE restart_value SET value='unsaved-sql'",'test');return {file:new TextDecoder().decode(await rt.read('/workspace/value.txt')),sql:await rt.sql('SELECT value FROM restart_value','test')};});
   assert.equal(pending.file,'unsaved-files');assert.equal(pending.sql.rows[0][0],'unsaved-sql');
   const pid=await ownedBrowserPid(profile),closed=new Promise(r=>context.once('close',r));process.kill(pid,'SIGKILL');
   let timer;try{await Promise.race([closed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Killed browser did not disconnect')),10000);})]);}finally{clearTimeout(timer);}
   page=await launch();
   const recovered=await page.evaluate(async options=>{
    const {NativeRuntime}=await import('/packages/runtime/src/native-runtime.mjs');const rt=await NativeRuntime.create(options);
    try{const response=await rt.request({script:'/workspace/check.php'});if(response.exitCode!==0)throw Error(new TextDecoder().decode(response.stderr));return {body:new TextDecoder().decode(response.body),metadata:await rt.metadata(),state:await rt.state()};}finally{rt.close();}
   },options);
   assert.equal(recovered.body,'committed-files|committed-sql');assert.equal(recovered.metadata.version,'committed-metadata');
   await writeFile(resolve(output,name+'.json'),JSON.stringify({browser:name,version,passed:true,scope:'Same private profile and origin; complete browser restart, then SIGKILL after unsaved file changes and SQL COMMIT. Last explicit snapshot recovered; no OS power-loss claim.',reopened,pending,recovered},null,2)+'\n');
   console.log(name,'full browser restart and forced interruption recovered last explicit file/SQL/metadata snapshot');
  }finally{try{await context?.close();}catch{/* Browser may have been killed. */}}
 }
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
