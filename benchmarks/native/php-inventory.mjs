/** Read-only inventory of the compiled PHP runtime in a real browser. */
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createStudioServer} from '../../scripts/serve-studio.mjs';
const root=resolve(new URL('../..',import.meta.url).pathname);
const {chromium}=await import(pathToFileURL(resolve(root,'build-work/php/node_modules/playwright/index.mjs')).href);
const server=createStudioServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const result=await page.evaluate(async()=>{
    const {NativeRuntime}=await import('/packages/runtime/src/native-runtime.mjs');
    const runtime=await NativeRuntime.create({moduleURL:new URL('/engine/pbl-runtime.mjs',location.href).href});
    try{
      await runtime.write('/workspace/inventory.php',`<?php
$extensions=get_loaded_extensions();sort($extensions);
$functions=['filter_var','ctype_alpha','mb_strlen','iconv','curl_init','imagecreate','token_get_all','finfo_open','gzencode'];
echo json_encode(['php'=>PHP_VERSION,'extensions'=>$extensions,'pdoDrivers'=>PDO::getAvailableDrivers(),'wrappers'=>stream_get_wrappers(),'functions'=>array_combine($functions,array_map('function_exists',$functions)),'classes'=>['ZipArchive'=>class_exists('ZipArchive'),'DOMDocument'=>class_exists('DOMDocument'),'SimpleXMLElement'=>class_exists('SimpleXMLElement')]]);`);
      const response=await runtime.request({script:'/workspace/inventory.php'});
      if(response.exitCode!==0)throw Error(new TextDecoder().decode(response.stderr));
      return {inventory:JSON.parse(new TextDecoder().decode(response.body)),state:await runtime.state()};
    }finally{runtime.close();}
  });
  const output=resolve(root,'build-work/php-runtime-inventory.json');await mkdir(resolve(output,'..'),{recursive:true});
  await writeFile(output,JSON.stringify({browser:browser.version(),...result},null,2)+'\n');console.log(JSON.stringify(result.inventory,null,2));
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
