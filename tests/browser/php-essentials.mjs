/** Real PHP extensions, uploads and shared PDO/MySQLi application operations. */
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createStudioServer} from '../../scripts/serve-studio.mjs';
const root=resolve(new URL('../..',import.meta.url).pathname);
const playwright=await import(pathToFileURL(resolve(root,'build-work/php/node_modules/playwright/index.mjs')).href);
const fixtures=await Promise.all(['php-essentials','php-database-essentials'].map(name=>readFile(resolve(root,`fixtures/compatibility/${name}.php`),'utf8')));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64');
const pngHash=createHash('sha256').update(png).digest('hex');
const server=createStudioServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try {
  for(const name of (process.argv[2]??'chromium,firefox').split(',')) {
    const browser=await playwright[name].launch({headless:true,...(name==='chromium'?{args:['--no-sandbox']}:{})});
    try {
      const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);
      const result=await page.evaluate(async({fixtures,png,pngHash})=>{
        const {NativeRuntime}=await import('/packages/runtime/src/native-runtime.mjs');
        const runtime=await NativeRuntime.create({moduleURL:new URL('/engine/pbl-runtime.mjs',location.href).href});
        const cases=[];
        try {
          await runtime.write('/workspace/essentials.php',fixtures[0]);
          await runtime.write('/workspace/database.php',fixtures[1]);
          const run=async(label,options)=>{
            const response=await runtime.request(options);
            const body=new TextDecoder().decode(response.body),stderr=new TextDecoder().decode(response.stderr);
            if(response.exitCode!==0||stderr)throw Error(label+': '+stderr+' '+body);
            const data=JSON.parse(body);if(!data.ok)throw Error(label+': '+body);
            cases.push({label,...data});
          };
          await run('PHP without SQL',{script:'/workspace/essentials.php'});
          const pureState=await runtime.state();
          if(pureState.sqlStarted||pureState.pthreadWorkers.created!==0)throw Error('Pure PHP eagerly initialized SQL');
          const boundary='pbl-essentials-upload';
          const encoder=new TextEncoder();
          const prefix=encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="sha256"\r\n\r\n${pngHash}\r\n--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="example.png"\r\nContent-Type: application/octet-stream\r\n\r\n`);
          const suffix=encoder.encode(`\r\n--${boundary}--\r\n`);
          const body=new Uint8Array(prefix.length+png.length+suffix.length);body.set(prefix);body.set(png,prefix.length);body.set(suffix,prefix.length+png.length);
          await run('Real binary multipart upload',{script:'/workspace/essentials.php',method:'POST',headers:[['Content-Type',`multipart/form-data; boundary=${boundary}`]],body});
          await run('Shared PDO/MySQLi project operations',{script:'/workspace/database.php'});
          const state=await runtime.state();
          if(state.nativeStatements!==0)throw Error('Native statements leaked after request teardown');
          return {passed:true,cases,pureState,state};
        } finally {runtime.close();}
      },{fixtures,png:[...png],pngHash});
      assert.equal(result.passed,true);
      const wasmPath=resolve(root,'build-work/bridge/.native-build/engine/wasm/runtime-dist/pbl-runtime.wasm');
      const output=resolve(root,`engine/fusion/receipts/php-essentials-${name}.json`);await mkdir(resolve(output,'..'),{recursive:true});
      await writeFile(output,JSON.stringify({browser:name,version:browser.version(),wasmBytes:(await stat(wasmPath)).size,wasmSha256:createHash('sha256').update(await readFile(wasmPath)).digest('hex'),...result},null,2)+'\n');
      console.log(name, 'PHP essentials, binary upload, PDO and MySQLi passed');
    } finally {await browser.close();}
  }
} finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
