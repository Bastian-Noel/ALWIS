import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createStudioServer} from '../../scripts/serve-studio.mjs';
const root=resolve(new URL('../..',import.meta.url).pathname),pw=await import(pathToFileURL(resolve(root,'build-work/php/node_modules/playwright/index.mjs')).href);
const server=createStudioServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{for(const name of (process.argv[2]??'chromium,firefox').split(',')){
 const browser=await pw[name].launch({headless:true,...(name==='chromium'?{args:['--no-sandbox']}:{})});
 try{const page=await browser.newPage();page.on('console',m=>{if(m.type()==='error')console.log(name,m.text());});page.on('pageerror',e=>console.log(name,e.message));await page.goto(`http://127.0.0.1:${server.address().port}/`);
 const result=await page.evaluate(async()=>{
  const {JavaScriptService,LspService}=await import('/apps/studio/editor/services.mjs');const report={};
  const {createCodeEditor}=await import('/apps/studio/editor/dist/codemirror.mjs');const surface=document.createElement('div');document.body.append(surface);let quotaStatus='';const model=createCodeEditor(surface,{path:'/quota.txt',onStatus:message=>quotaStatus=message});surface.value='original';model.view.dispatch({changes:{from:0,to:8,insert:'é'.repeat(600000)}});if(surface.value!=='original'||!quotaStatus.includes('1 Mio'))throw Error('Editor UTF-8 document quota bypassed');model.destroy();surface.remove();report.editorUTF8Quota=true;
  const js=new JavaScriptService();try{
   const text="$('button').";const completion=await js.call('complete','/example.js',text,text.length);report.jquery=completion;if(!completion.some(x=>x.label==='addClass'))throw Error('jQuery .addClass completion absent: '+JSON.stringify(completion));
   const diagnostics=await js.call('diagnostics','/example.js','const = ;',0);if(!diagnostics.some(x=>x.severity==='error'))throw Error('JS malformed syntax accepted');report.javascriptDiagnostics=diagnostics;report.swcLinearMemoryBytes=js.memoryBytes;
   const local=await js.call('complete','/example.js',text,text.length,{'/custom.d.ts':'declare function $(selector: string): { customLocal(): void };'});
   if(!local.some(x=>x.label==='customLocal')||local.some(x=>x.label==='addClass'))throw Error('Project jQuery declarations do not take precedence');report.projectDefinitionsOverride=true;
  }finally{js.close();}
  for(const [engine,path,text]of [['php','/example.php','<?php function broken( {'],['html','/example.html','<!doctype html><html><head><title>Example</title></head><body><div></body></html>']]){
   let diagnostics=[];const service=new LspService(engine,{files:engine==='php'?{'/model.php':'<?php class ProjectModel { public function customProjectMethod(): void {} }'}:{},onDiagnostics:d=>diagnostics=d});try{await service.ready;report[engine]={capabilities:service.capabilities};await service.document(path,text);const deadline=performance.now()+8000;while(engine==='html'&&!diagnostics.length&&performance.now()<deadline)await new Promise(r=>setTimeout(r,50));report[engine].diagnostics=diagnostics;if(engine==='html'&&!diagnostics.length)throw Error(engine+' diagnostics absent');
   report[engine].linearMemoryBytes=service.memoryBytes;
   if(engine==='php'){const code='<?php $pdo = new PDO("mysql:dbname=test"); $pdo->';const completion=await service.complete(path,code,code.length);report.php.completion=completion;report.php.linearMemoryAfterCompletionBytes=service.memoryBytes;if(!completion.some(x=>x.label.toLowerCase().includes('prepare')))throw Error('PHP PDO completion absent');const projectCode='<?php $model = new ProjectModel(); $model->';const projectCompletion=await service.complete(path,projectCode,projectCode.length);if(!projectCompletion.some(x=>x.label.includes('customProjectMethod')))throw Error('Project PHP class completion absent');report.php.projectClassCompletion=true;}
   }finally{service.close();}
  }
  return {passed:true,...report};
 });assert.equal(result.passed,true);await mkdir(resolve(root,'apps/studio/receipts/editor'),{recursive:true});await writeFile(resolve(root,`apps/studio/receipts/editor/services-${name}.json`),JSON.stringify({browser:name,version:browser.version(),...result},null,2)+'\n');console.log(name,'WASM PHP/HTML and SWC/jQuery services passed');
 }finally{await browser.close();}
}}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
