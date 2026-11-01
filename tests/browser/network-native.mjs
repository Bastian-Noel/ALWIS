/** Real PHP HTTP wrapper: bounded Fetch, cancellation, binary data and recovery. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const repo=resolve(new URL('../..',import.meta.url).pathname);
const dist=join(repo,'build-work/bridge/.native-build/engine/wasm/runtime-dist');
const playwright=await import(pathToFileURL(join(repo,'build-work/php/node_modules/playwright/index.mjs')).href);
const block=Buffer.alloc(65536,97);block[0]=0;block[1]=255;
const hash=createHash('sha256');for(let i=0;i<256;i++)hash.update(block);const expectedHash=hash.digest('hex');
const transfers=[];
const server=createServer(async(request,response)=>{
  response.setHeader('Cross-Origin-Opener-Policy','same-origin');response.setHeader('Cross-Origin-Embedder-Policy','require-corp');response.setHeader('Cache-Control','no-store');
  const url=new URL(request.url,'http://localhost');
  if(url.pathname==='/'){response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>Native network</title>');return;}
  if(url.pathname==='/stream'){
    const transfer={browser:url.searchParams.get('browser'),kind:url.searchParams.get('kind'),sent:0,finished:false};transfers.push(transfer);
    const size=Number(url.searchParams.get('size'));
    assert.ok(Number.isSafeInteger(size)&&size>=0&&size<=64*1024*1024);
    response.setHeader('Content-Type','application/octet-stream');
    if(transfer.kind==='declared'||transfer.kind==='head')response.setHeader('Content-Length',size);
    if(transfer.kind==='head'){response.end();transfer.finished=true;return;}
    // Deliberately slow the producer so refusal must cancel a real pending transfer.
    const pump=()=>{
      if(response.destroyed)return;
      if(transfer.sent===size){transfer.finished=true;response.end();return;}
      const count=Math.min(block.length,size-transfer.sent);transfer.sent+=count;
      if(response.write(block.subarray(0,count)))timer=setTimeout(pump,2);else response.once('drain',()=>{timer=setTimeout(pump,2);});
    };
    let timer;response.once('close',()=>clearTimeout(timer));pump();return;
  }
  if(url.pathname==='/gzip'){
    response.setHeader('Content-Encoding','gzip');const compressed=gzipSync(Buffer.alloc(17*1024*1024,97));response.setHeader('Content-Length',compressed.length);response.end(compressed);return;
  }
  if(url.pathname==='/slow'){
    if(url.searchParams.has('body'))response.write('first');
    const timer=setTimeout(()=>response.end('late'),500);response.once('close',()=>clearTimeout(timer));return;
  }
  if(url.pathname==='/redirect'){response.writeHead(302,{Location:'/small'});response.end();return;}
  if(url.pathname==='/small'){response.setHeader('X-Native-Reply','present');response.end('network-ok');return;}
  if(url.pathname==='/status'){response.writeHead(418);response.end('teapot');return;}
  if(url.pathname==='/empty'){response.writeHead(204);response.end();return;}
  try{
    const base=url.pathname.startsWith('/engine/')?dist:repo;
    const relative=url.pathname.startsWith('/engine/')?url.pathname.slice(8):url.pathname.slice(1);
    const path=resolve(base,relative);if(!path.startsWith(base+sep)){response.writeHead(403).end();return;}
    response.setHeader('Content-Type',extname(path)==='.wasm'?'application/wasm':'text/javascript');response.end(await readFile(path));
  }catch{response.writeHead(404).end();}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
try{
  for(const name of (process.argv[2]??'chromium,firefox').split(',')){
    assert.ok(['chromium','firefox'].includes(name));
    const browser=await playwright[name].launch({headless:true,...(name==='chromium'?{args:['--no-sandbox']}: {})});
    try{
      const page=await browser.newPage();page.on('console',m=>console.log(name,m.type(),m.text()));page.on('pageerror',e=>console.error(name,e));
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      const result=await page.evaluate(async({name,expectedHash})=>{
        const {NativeRuntime}=await import('/packages/runtime/src/native-runtime.mjs');
        const runtime=await NativeRuntime.create({moduleURL:new URL('/engine/pbl-runtime.mjs',location.href).href});
        const cases=[];
        try{
          await runtime.write('/workspace/network.php',`<?php
$warnings=[];set_error_handler(function($n,$s)use(&$warnings){$warnings[]=$s;return true;});
$options=['timeout'=>isset($_GET['timeout'])?(float)$_GET['timeout']:10];
if(isset($_GET['method']))$options['method']=$_GET['method'];
if(isset($_GET['ignore']))$options['ignore_errors']=true;
if(isset($_GET['large_request'])){$options['method']='POST';$options['content']=str_repeat('x',8*1024*1024+1);}
$body=file_get_contents($_GET['url'],false,stream_context_create(['http'=>$options]));
restore_error_handler();echo json_encode(['ok'=>$body!==false,'length'=>$body===false?null:strlen($body),'hash'=>$body===false?null:hash('sha256',$body),'warnings'=>$warnings,'headers'=>$http_response_header??[]]);`);
          const check=async(label,path,options={},failure)=>{
            const url=new URL('/network.php',location.href);url.searchParams.set('url',new URL(path,location.href).href);
            for(const [key,value]of Object.entries(options))url.searchParams.set(key,value);
            const response=await runtime.request({script:'/workspace/network.php',url:url.href});
            if(response.exitCode!==0)throw Error(label+': '+new TextDecoder().decode(response.stderr));
            const data=JSON.parse(new TextDecoder().decode(response.body));
            if(failure){if(data.ok||!data.warnings.some(w=>w.includes(failure)))throw Error(label+': '+JSON.stringify(data));}
            else if(!data.ok)throw Error(label+': '+JSON.stringify(data));
            cases.push({label,...data});return data;
          };
          const exact=await check('binary body at exact 16 MiB limit',`/stream?size=16777216&kind=chunked&browser=${name}`);
          if(exact.length!==16777216||exact.hash!==expectedHash)throw Error('Exact-limit binary body changed');
          await check('chunked body cancellation',`/stream?size=67108864&kind=chunked&browser=${name}`,{},'response exceeds byte limit');
          await check('oversized Content-Length refused',`/stream?size=67108864&kind=declared&browser=${name}`,{},'response exceeds byte limit');
          await check('gzip decoded body limit','/gzip',{},'response exceeds byte limit');
          await check('timeout before headers','/slow',{timeout:0.05},'timed out');
          await check('timeout during body','/slow?body=1',{timeout:0.05},'timed out');
          await check('request body bound','/small',{large_request:1},'request exceeds byte limit');
          await check('HTTP error without ignore_errors','/status',{},'status 418');
          const ignored=await check('HTTP error with ignore_errors','/status',{ignore:1});if(ignored.length!==6)throw Error('ignore_errors body');
          const empty=await check('204 empty body','/empty');if(empty.length!==0)throw Error('Empty body mismatch');
          const head=await check('HEAD with large representation','/stream?size=67108864&kind=head',{method:'HEAD'});if(head.length!==0)throw Error('HEAD body mismatch');
          const redirect=await check('redirect and recovery','/redirect');if(redirect.length!==10||!redirect.headers.some(h=>h.toLowerCase()==='x-native-reply: present'))throw Error('Redirect/final headers mismatch');
          if((await runtime.state()).sqlStarted)throw Error('HTTP initialized MariaDB');
          if((await runtime.sql('SELECT 42')).rows[0][0]!=='42')throw Error('SQL unavailable after failed network reads');
          await check('PHP HTTP after SQL activation','/small');
          return {passed:true,cases,state:await runtime.state()};
        }finally{runtime.close();}
      },{name,expectedHash});
      const observed=transfers.filter(t=>t.browser===name);const chunked=observed.find(t=>t.kind==='chunked'&&!t.finished);const declared=observed.find(t=>t.kind==='declared');
      assert.ok(chunked&&chunked.sent>=16*1024*1024&&chunked.sent<64*1024*1024,'Oversized chunked producer must actually be cancelled');
      assert.ok(declared&&!declared.finished&&declared.sent<1024*1024,'Declared oversize must stop before body collection');
      result.transfers=observed;const output=join(dist,'receipts');await mkdir(output,{recursive:true});await writeFile(join(output,name+'-network.json'),JSON.stringify(result,null,2)+'\n');
      console.log(name,'bounded native HTTP passed',JSON.stringify(observed));
    }finally{await browser.close();}
  }
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
