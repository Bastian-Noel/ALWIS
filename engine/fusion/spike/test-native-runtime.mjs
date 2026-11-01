/** Vertical integration: custom C PDO/MySQLi, native files, CGI and browser HTTP.
 * Usage: node test-native-runtime.mjs [chromium,firefox]
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const repo = resolve(new URL('../../..', import.meta.url).pathname);
const dist = resolve(repo, 'build-work/bridge/.native-build/engine/wasm/runtime-dist');
const playwright = await import(pathToFileURL(join(repo, 'build-work/php/node_modules/playwright/index.mjs')).href);
const storageOnly=process.argv.includes('--storage-only');
const server = createServer(async (request, response) => {
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  response.setHeader('Cache-Control', 'no-store');
  if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Native runtime</title>'); return; }
  if (request.url === '/network-post') {
    let body = ''; for await (const chunk of request) body += chunk;
    response.setHeader('Content-Type', 'application/json'); response.setHeader('X-Native-Reply', 'present');
    response.writeHead(202); response.end(JSON.stringify([request.method, request.headers['x-native-request'], body])); return;
  }
  if (request.url === '/network-check') { response.setHeader('Content-Type', 'text/plain'); response.end('network-ok'); return; }
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const base = pathname.startsWith('/engine/') ? dist : repo;
    const relative = pathname.startsWith('/engine/') ? pathname.slice(8) : pathname.slice(1);
    const path = resolve(base, relative);
    if (!path.startsWith(base + sep)) { response.writeHead(403).end(); return; }
    response.setHeader('Content-Type', extname(path) === '.wasm' ? 'application/wasm' : 'text/javascript');
    response.end(await readFile(path));
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const fixtures = {};
for (const name of ['schema.sql', 'pdo.php', 'mysqli.php']) fixtures[name] = await readFile(join(repo, 'fixtures/school', name), 'utf8');
fixtures['coverage.php']=await readFile(join(repo,'fixtures/compatibility/native-coverage.php'),'utf8');
await mkdir(join(dist, 'receipts'), { recursive: true });
try {
  for (const browserName of (process.argv[2] ?? 'chromium,firefox').split(',')) {
    assert.ok(['chromium', 'firefox'].includes(browserName));
    const browser = await playwright[browserName].launch({ headless: true, ...(browserName === 'chromium' ? { args: ['--no-sandbox'] } : {}) });
    try {
      const page = await browser.newPage();
      page.on('console', message => console.log(browserName, message.type(), message.text()));
      page.on('pageerror', error => console.error(browserName, error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      const results = storageOnly?null:await page.evaluate(async fixtures => {
        const { NativeRuntime } = await import('/packages/runtime/src/native-runtime.mjs');
        const runtime = await NativeRuntime.create({ moduleURL: new URL('/engine/pbl-runtime.mjs', location.href).href });
        const decode = value => new TextDecoder().decode(value);
        const checked = async options => {
          const result = await runtime.request(options);
          if (result.exitCode !== 0) throw Error(`PHP exit ${result.exitCode}: ${decode(result.stderr)} body=${decode(result.body)}`);
          return { ...result, body: decode(result.body), stderr: decode(result.stderr) };
        };
        try {
          console.log('native: initialized');
          const initial = await runtime.state();
          if (initial.sqlStarted) throw Error('SQL started eagerly');
          await runtime.write('/workspace/data/value.txt', 'native-file-ok');
          await runtime.rename('/workspace/data/value.txt', '/workspace/data/renamed.txt');
          console.log('native: files written and renamed');
          const file = decode(await runtime.read('/workspace/data/renamed.txt'));
          if (file !== 'native-file-ok') throw Error('Native file contents mismatch');
          const owned=await runtime.read('/workspace/data/renamed.txt');owned[0]=0;
          if(decode(await runtime.read('/workspace/data/renamed.txt'))!=='native-file-ok')throw Error('Read result exposed the live filesystem backing buffer');
          await runtime.write('/workspace/http.php', '<?php http_response_code(201); header("X-Native: yes"); echo json_encode([$_GET["q"] ?? null, $_POST["name"] ?? null, file_get_contents(__DIR__."/data/renamed.txt")]);');
          console.log('native: entering CGI');
          const http = await checked({ script: '/workspace/http.php', url: new URL('/http.php?q=query', location.href).href, method: 'POST', headers: [['Content-Type', 'application/x-www-form-urlencoded']], body: 'name=posted' });
          if (http.status !== 201 || JSON.stringify(JSON.parse(http.body)) !== JSON.stringify(['query', 'posted', 'native-file-ok'])) throw Error('CGI GET/POST/files response mismatch: ' + http.body);
          const afterPurePhp = await runtime.state();
          if (afterPurePhp.sqlStarted) throw Error('Pure PHP started SQL');
          await runtime.write('/workspace/network.php', '<?php echo file_get_contents($_GET["url"]);');
          console.log('native: entering browser network');
          const network = await checked({ script: '/workspace/network.php', url: new URL('/network.php?url=' + encodeURIComponent(new URL('/network-check', location.href).href), location.href).href });
          if (network.body !== 'network-ok') throw Error('Native browser HTTP stream mismatch: ' + network.body + ' ' + network.stderr);
          await runtime.write('/workspace/network-context.php', `<?php
$ctx=stream_context_create(['http'=>['method'=>'POST','header'=>['Content-Type: text/plain','X-Native-Request: custom'],'content'=>'native-body','timeout'=>10]]);
$body=file_get_contents($_GET['url'],false,$ctx);
echo json_encode([json_decode($body,true),$http_response_header]);`);
          const networkContext = await checked({ script:'/workspace/network-context.php', url:new URL('/network-context.php?url='+encodeURIComponent(new URL('/network-post',location.href).href),location.href).href });
          const contextData=JSON.parse(networkContext.body);
          if (JSON.stringify(contextData[0])!==JSON.stringify(['POST','custom','native-body']) || !contextData[1][0].includes('202') || !contextData[1].some(h=>h.toLowerCase()==='x-native-reply: present')) throw Error('Native HTTP context/headers mismatch: '+networkContext.body);
          await runtime.write('/workspace/schema.sql', fixtures['schema.sql']);
          await runtime.write('/workspace/bootstrap.php', '<?php $db=new PDO("mysql:dbname=test;charset=utf8mb4","root",""); $db->exec(file_get_contents(__DIR__."/schema.sql")); echo "schema-ok";');
          console.log('native: bootstrapping PDO');
          const schema = await checked({ script: '/workspace/bootstrap.php' });
          if (schema.body !== 'schema-ok') throw Error('Schema bootstrap mismatch');
          const driverResults = {};
          for (const driver of ['pdo', 'mysqli']) {
            await runtime.write(`/workspace/${driver}.php`, fixtures[driver + '.php']);
            console.log('native: school fixture ' + driver);
            const result = await checked({ script: `/workspace/${driver}.php` });
            driverResults[driver] = JSON.parse(result.body);
            if (driverResults[driver].ok !== true) throw Error(driver + ' fixture failed');
          }
          await runtime.write('/workspace/object.php', '<?php $db=new mysqli("localhost","root","","school"); $stmt=$db->prepare("SELECT ? AS value"); $value="before"; $stmt->bind_param("s",$value); $value="after"; $stmt->execute(); $row=$stmt->get_result()->fetch_assoc(); $stmt->close(); $db->close(); echo $row["value"];');
          const object = await checked({ script: '/workspace/object.php' });
          if (object.body !== 'after') throw Error('OO MySQLi binding mismatch');
          await runtime.write('/workspace/bound.php', `<?php
$db=new mysqli('localhost','root','','school');
$stmt=$db->prepare("SELECT 42 AS i, 1.5e0 AS f, CAST('123.45' AS DECIMAL(6,2)) AS d, NULL AS n, UNHEX('4100FF') AS b");
$stmt->execute(); $stmt->bind_result($i,$f,$d,$n,$b); $stmt->store_result();
if(!$stmt->fetch() || $i!==42 || $f!==1.5 || $d!=='123.45' || $n!==NULL || bin2hex($b)!=='4100ff' || $stmt->fetch()!==NULL) throw new Exception('bind_result types');
$stmt->execute(); $r=$stmt->get_result(); $r->free();
try { $stmt->fetch(); throw new Exception('closed result accepted'); } catch (Error $e) {}
$r=$db->query('SELECT 1 AS x UNION ALL SELECT 2');
if($r->fetch_all(MYSQLI_ASSOC)!==[['x'=>'1'],['x'=>'2']]) throw new Exception('fetch_all');
$r->data_seek(0); $a=$r->fetch_array(); if($a[0]!=='1'||$a['x']!=='1') throw new Exception('fetch_array');
$stmt->close(); $db->close(); gc_collect_cycles(); echo 'bound-results-ok';`);
          const bound=await checked({script:'/workspace/bound.php'});
          if(bound.body!=='bound-results-ok') throw Error('Native MySQLi results mismatch: '+bound.body);
          await runtime.write('/workspace/metadata.php', `<?php
$db=new mysqli('localhost','root','','school');
$stmt=$db->prepare('SELECT ? AS label, ? AS nullable, ? AS binary_value');
if($stmt->param_count!==3 || $stmt->field_count!==3) throw new Exception('statement counts');
$stmt->execute(['école',NULL,"A\\0B"]); $r=$stmt->get_result(); $row=$r->fetch_assoc();
if($row['label']!=='école' || $row['nullable']!==NULL || bin2hex($row['binary_value'])!=='410042') throw new Exception('execute array values');
$fields=$r->fetch_fields(); if(count($fields)!==3 || $fields[0]->name!=='label' || !isset($fields[0]->type,$fields[0]->charsetnr,$fields[0]->flags)) throw new Exception('field metadata');
if($r->fetch_field()->name!=='label' || $r->fetch_field_direct(2)->name!=='binary_value') throw new Exception('field iterator');
$meta=$stmt->result_metadata(); if($meta->field_count!==3 || $meta->num_rows!==0) throw new Exception('statement metadata');
$stmt->execute(['second',NULL,'']); if($stmt->get_result()->fetch_assoc()['label']!=='second') throw new Exception('array reexecution');
try { $stmt->execute(['bad']); throw new Exception('wrong arity accepted'); } catch (ArgumentCountError $e) {}
try { $stmt->execute(['named'=>'bad']); throw new Exception('named values accepted'); } catch (ValueError $e) {}
$stmt->close(); $db->close(); echo 'metadata-array-ok';`);
          const metadata=await checked({script:'/workspace/metadata.php'});
          if(metadata.body!=='metadata-array-ok') throw Error('MySQLi metadata/array mismatch: '+metadata.body);
          await runtime.write('/workspace/coverage.php',fixtures['coverage.php']);
          const coverage=await checked({script:'/workspace/coverage.php'});
          if(JSON.parse(coverage.body).ok!==true)throw Error('Native compatibility coverage failed');
          for(const sql of ["SELECT REPEAT('x',65536) FROM seq_1_to_1000",'SELECT seq FROM seq_1_to_10001']) {
            let refused=false;try{await runtime.sql(sql,'school');}catch(error){refused=error.message.includes('WASM result exceeds');}
            if(!refused)throw Error('Console result budget was not enforced');
            const check=await runtime.sql('SELECT 42');if(check.rows[0][0]!=='42')throw Error('Console did not recover after result refusal');
          }
          await runtime.sql('DELETE FROM compatibility_tx WHERE id=2','school');
          await runtime.write('/workspace/abandon.php',"<?php $db=new PDO('mysql:dbname=school','root','');$db->beginTransaction();$db->exec('INSERT INTO compatibility_tx VALUES(2,99)');throw new RuntimeException('intentional-abandon');");
          const abandoned=await runtime.request({script:'/workspace/abandon.php'});
          if(abandoned.exitCode===0||!decode(abandoned.stderr).includes('intentional-abandon'))throw Error('Expected PHP abandonment was not reported');
          const rollbackCheck=await runtime.sql('SELECT COUNT(*) FROM compatibility_tx WHERE id=2','school');
          if(rollbackCheck.rows[0][0]!=='0'||(await runtime.state()).sqlConnections!==1)throw Error('Abandoned request transaction/connection leaked');
          await runtime.sql("SELECT REPEAT('x',10485760) INTO DUMPFILE '/outside-quota-1'",'school');
          let outsideRefused=false;try{await runtime.sql("SELECT REPEAT('x',10485760) INTO DUMPFILE '/outside-quota-2'");}catch{outsideRefused=true;}
          const systemQuota=await runtime.state();
          if(!outsideRefused||systemQuota.vfs.groups.system.bytes>systemQuota.vfs.groups.system.maxBytes)throw Error('SQL OUTFILE escaped the fallback VFS quota');
          if((await runtime.sql('SELECT 42')).rows[0][0]!=='42')throw Error('SQL failed to recover after output-file quota refusal');
          const consoleSet = await runtime.sql('SET @pbl_console_marker = 42', 'school');
          const duringConsole = await checked({ script: '/workspace/object.php' });
          const consoleMarker = await runtime.sql('SELECT @pbl_console_marker AS value');
          if (consoleMarker.rows[0][0] !== '42') throw Error('PHP cleanup invalidated the independent console');
          const consoleTypes = await runtime.sql("SELECT NULL AS n, UNHEX('4100FF') AS b, CAST('18446744073709551615' AS UNSIGNED) AS big, CAST('12345678901234.123456' AS DECIMAL(20,6)) AS amount");
          const values = consoleTypes.rows[0];
          if (values[0] !== null || !(values[1] instanceof Uint8Array) || [...values[1]].join(',') !== '65,0,255' || values[2] !== '18446744073709551615' || values[3] !== '12345678901234.123456') throw Error('Native console type fidelity failed');
          await runtime.closeConsole();
          const final = await runtime.state();
          if (final.sqlConnections !== 0) throw Error('Request-owned native connections leaked');
          const stopped = await runtime.stopSQL();
          if (stopped.sqlStarted) throw Error('SQL did not stop');
          const phpAfterStop = await checked({ script: '/workspace/http.php' });
          if (phpAfterStop.sqlStarted || phpAfterStop.status !== 201) throw Error('PHP is not usable independently after SQL stop');
          for(const script of ['/workspace/pdo.php','/workspace/mysqli.php']){const refused=await runtime.request({script});if(refused.exitCode===0||!decode(refused.stderr).includes('SQL is stopped'))throw Error('PHP adapter attempted an unsafe SQL restart');}
          if((await checked({script:'/workspace/http.php'})).status!==201)throw Error('Stopped SQL refusal poisoned pure PHP');
          return { initial, file, http, afterPurePhp, network, networkContext, bound, metadata, coverage, rollbackCheck, systemQuota, schema, driverResults, object, consoleMarker, consoleTypes, phpAfterStop, final, stopped };
        } finally { runtime.close(); }
      }, fixtures);
      const quota=storageOnly?null:await page.evaluate(async()=>{
        const {NativeRuntime}=await import('/packages/runtime/src/native-runtime.mjs');
        const runtime=await NativeRuntime.create({moduleURL:new URL('/engine/pbl-runtime.mjs',location.href).href,vfsLimits:{projectBytes:8*1024*1024,projectFileBytes:4*1024*1024,projectNodes:12,openFiles:8,tempBytes:1024*1024,tempFileBytes:1024*1024}});
        try{
          const initial=await runtime.state();
          await runtime.write('/workspace/quota.php',`<?php
function must($value,$why){if(!$value)throw new Exception($why);}
$chunk=str_repeat('a',4*1024*1024);
must(file_put_contents(__DIR__.'/a',$chunk)===strlen($chunk),'initial write');
$h=fopen(__DIR__.'/a','r+');unlink(__DIR__.'/a');
must(@file_put_contents(__DIR__.'/b',$chunk)===false,'unlinked open file must retain quota');
fclose($h);must(file_put_contents(__DIR__.'/b',$chunk)===strlen($chunk),'quota released after close');
$h=fopen(__DIR__.'/b','a');must(@fwrite($h,'x')===false,'append limit');fclose($h);
$h=fopen(__DIR__.'/b','r+');must(@ftruncate($h,5*1024*1024)===false,'truncate growth limit');fclose($h);
must(@file_put_contents('/tmp/over-quota',str_repeat('t',2*1024*1024))===false,'temporary file quota');
must(rename(__DIR__.'/b',__DIR__.'/renamed'),'rename within project');
$handles=[];for($i=0;$i<30;$i++){$h=@fopen(__FILE__,'r');if($h===false)break;$handles[]=$h;}must(count($handles)<30,'open descriptor quota');foreach($handles as $h)fclose($h);
echo 'quota-php-ok';`);
          const response=await runtime.request({script:'/workspace/quota.php'});
          if(response.exitCode!==0||new TextDecoder().decode(response.body)!=='quota-php-ok')throw Error('Quota PHP/POSIX failure: '+new TextDecoder().decode(response.stderr));
          const before=await runtime.state();let rejected=false;
          try{await runtime.write('/workspace/extra',new Uint8Array(4*1024*1024));}catch(error){rejected=error.message.includes('quota');}
          if(!rejected)throw Error('Facade write exceeded aggregate project quota');
          const after=await runtime.state();
          if(after.vfs.groups.project.bytes!==before.vfs.groups.project.bytes||after.vfs.groups.project.nodes!==before.vfs.groups.project.nodes)throw Error('Failed atomic write leaked quota');
          await runtime.remove('/workspace/renamed');await runtime.write('/workspace/reused',new Uint8Array(4*1024*1024));
          let nodesRejected=false;for(let i=0;i<30;i++){try{await runtime.write('/workspace/node'+i,'');}catch{nodesRejected=true;break;}}
          if(!nodesRejected)throw Error('Project node quota not enforced');
          const final=await runtime.state();if(final.vfs.groups.project.nodes>12)throw Error('Node budget exceeded');
          return {passed:true,initial,before,after,final,checks:['PHP direct writes','open/unlinked inode accounting','append','ftruncate','temporary files','rename','atomic write failure cleanup','budget reuse','node limit','descriptor limit']};
        }finally{runtime.close();}
      });
      const persistence = await page.evaluate(async () => {
        const { NativeRuntime } = await import('/packages/runtime/src/native-runtime.mjs');
        const projectKey = 'test-' + crypto.randomUUID();
        const options = { moduleURL: new URL('/engine/pbl-runtime.mjs', location.href).href, projectKey };
        let runtime = await NativeRuntime.create(options);
        try {
          await runtime.write('/workspace/versioned.txt','initial-version');
          await runtime.write('/workspace/touch.php',"<?php touch(__DIR__.'/versioned.txt',1234567890);echo 'touched';");
          await runtime.request({script:'/workspace/touch.php'});
          await runtime.write('/workspace/saved.php', '<?php $db=new PDO("mysql:dbname=durable","root",""); echo $db->query("SELECT value FROM entries WHERE id=1")->fetchColumn();');
          await runtime.sql('CREATE DATABASE durable');
          await runtime.sql('CREATE TABLE entries (id INT PRIMARY KEY, value VARCHAR(40)) ENGINE=InnoDB', 'durable');
          await runtime.sql("INSERT INTO entries VALUES (1, 'saved-native-project')");
          await runtime.shutdown();
          runtime = await NativeRuntime.create(options);
          const response = await runtime.request({ script: '/workspace/saved.php' });
          const output = new TextDecoder().decode(response.body);
          if (response.exitCode !== 0 || output !== 'saved-native-project') throw Error('Persistent file/SQL restore failed: ' + output + ' ' + new TextDecoder().decode(response.stderr));
          const sql = await runtime.sql('SELECT value FROM entries WHERE id=1', 'durable');
          if (sql.rows[0][0] !== 'saved-native-project') throw Error('Persistent console SQL mismatch');
          await runtime.write('/workspace/versioned.txt','same-mtime-updated');await runtime.request({script:'/workspace/touch.php'});
          await runtime.shutdown();runtime=await NativeRuntime.create(options);
          if(new TextDecoder().decode(await runtime.read('/workspace/versioned.txt'))!=='same-mtime-updated')throw Error('Content change with unchanged mtime was not persisted');
          await runtime.shutdown();
          return { passed: true, projectKey, output, sql, scope: 'New owner worker and WASM instance in the same browser profile after explicit save' };
        } finally { runtime.close(); }
      });
      const atomicPersistence=await page.evaluate(async()=>{
        const {NativeRuntime}=await import('/packages/runtime/src/native-runtime.mjs');
        const projectKey='atomic-'+crypto.randomUUID(),options={moduleURL:new URL('/engine/pbl-runtime.mjs',location.href).href,projectKey};
        let runtime=await NativeRuntime.create(options);
        try{
          if((await runtime.state()).storageLayout!=='atomic-v2')throw Error('New project did not use a single persistent store');
          await runtime.write('/workspace/saved.txt','old-files');await runtime.sql('CREATE TABLE atomic_value(value VARCHAR(30))','test');await runtime.sql("INSERT INTO atomic_value VALUES('old-sql')");
          await runtime.shutdown({metadata:{version:'old-metadata'}});
          console.log('native: starting failure-injection worker');runtime=await NativeRuntime.create({...options,workerURL:new URL('/tests/browser/idb-failure-worker.mjs',location.href)});
          await runtime.write('/workspace/saved.txt','new-files');await runtime.sql("UPDATE atomic_value SET value='new-sql'",'test');
          console.log('native: injecting failed project save');await runtime.call('test-arm-failure',{path:'/.pbl/projects/@v2/'+projectKey+'/files/saved.txt'});
          let rejected=false;try{await runtime.save({version:'new-metadata'});}catch{rejected=true;}
          if(!rejected)throw Error('Injected storage failure was not reported');const injected=await runtime.call('test-injected-state');if(injected.successfulWrites!==1)throw Error('Fault did not follow a successful storage write');
          let restartRefused=false;try{await runtime.sql('SELECT value FROM atomic_value','test');}catch(error){restartRefused=error.message.includes('stopped');}if(!restartRefused||(await runtime.state()).sqlPhase!=='stopped')throw Error('Unsafe SQL restart was not blocked');runtime.close();
          runtime=await NativeRuntime.create(options);
          const file=new TextDecoder().decode(await runtime.read('/workspace/saved.txt')),sql=await runtime.sql('SELECT value FROM atomic_value','test'),metadata=await runtime.metadata();
          if(file!=='old-files'||sql.rows[0][0]!=='old-sql'||metadata.version!=='old-metadata')throw Error('Failed transaction produced a mixed project snapshot');
          await runtime.shutdown({metadata});
          runtime=await NativeRuntime.create({...options,workerURL:new URL('/tests/browser/idb-failure-worker.mjs',location.href)});
          console.log('native: retry project files '+JSON.stringify(await runtime.list('/workspace')));await runtime.write('/workspace/saved.txt','retry-files');await runtime.sql("UPDATE atomic_value SET value='retry-sql'",'test');
          await runtime.call('test-arm-failure',{path:'/.pbl/projects/@v2/'+projectKey+'/files/saved.txt'});
          let retryFailure=false;try{await runtime.save({version:'retry-metadata'});}catch{retryFailure=true;}if(!retryFailure)throw Error('Retry scenario did not fail first');
          await runtime.shutdown({metadata:{version:'retry-metadata'}});runtime=await NativeRuntime.create(options);
          const retriedFile=new TextDecoder().decode(await runtime.read('/workspace/saved.txt')),retriedSql=await runtime.sql('SELECT value FROM atomic_value','test'),retriedMetadata=await runtime.metadata();
          if(retriedFile!=='retry-files'||retriedSql.rows[0][0]!=='retry-sql'||retriedMetadata.version!=='retry-metadata')throw Error('Retrying failed snapshot did not recover all components');
          await runtime.shutdown({metadata:retriedMetadata});
          return {passed:true,scope:'Genuine IndexedDB ConstraintError after a successful put; old snapshot recovered, unsafe in-place restart refused, subsequent save retry recovered all components',file,sql,metadata,retry:{file:retriedFile,sql:retriedSql,metadata:retriedMetadata}};
        }finally{runtime.close();}
      });
      console.log('native: failed transaction restored coherently');
      const legacyPersistence=await page.evaluate(async()=>{
        const {NativeRuntime}=await import('/packages/runtime/src/native-runtime.mjs');const key='legacy-'+crypto.randomUUID(),mount='/.pbl/projects/'+key;
        await new Promise((resolve,reject)=>{
          const open=indexedDB.open(mount,21);open.onupgradeneeded=()=>{const store=open.result.createObjectStore('FILE_DATA');store.createIndex('timestamp','timestamp');};open.onerror=()=>reject(open.error);
          open.onsuccess=()=>{const db=open.result,tx=db.transaction('FILE_DATA','readwrite');tx.objectStore('FILE_DATA').put({timestamp:new Date(),mode:33188,contents:new TextEncoder().encode('legacy-project-preserved')},mount+'/legacy.txt');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
        });
        const options={moduleURL:new URL('/engine/pbl-runtime.mjs',location.href).href,projectKey:key};let runtime=await NativeRuntime.create(options);
        try{
          if((await runtime.state()).storageLayout!=='legacy-split')throw Error('Legacy project layout was ignored');
          if(new TextDecoder().decode(await runtime.read('/workspace/legacy.txt'))!=='legacy-project-preserved')throw Error('Legacy project file lost');
          await runtime.sql('CREATE TABLE legacy_sql(value INT)','test');await runtime.sql('INSERT INTO legacy_sql VALUES(42)');await runtime.shutdown();runtime=await NativeRuntime.create(options);
          if((await runtime.sql('SELECT value FROM legacy_sql','test')).rows[0][0]!=='42')throw Error('Legacy SQL restore failed');
          await runtime.shutdown();return {passed:true,scope:'Seeded Emscripten 6.0.6 legacy FILE_DATA store retained; SQL saved/reopened through compatibility layout'};
        }finally{runtime.close();}
      });
      const receipt = { browser: browserName, version: browser.version(), passed: true, scope:storageOnly?'storage-only':'all-native', results, quota, persistence, atomicPersistence, legacyPersistence };
      await writeFile(join(dist, 'receipts', `${browserName}${storageOnly?'-storage':''}.json`), JSON.stringify(receipt, null, 2) + '\n');
      console.log(browserName, storageOnly?'native storage checks passed':'native files/CGI/network/PDO/MySQLi/storage passed');
    } finally { await browser.close(); }
  }
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
