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
      const results = await page.evaluate(async fixtures => {
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
          return { initial, file, http, afterPurePhp, network, networkContext, bound, schema, driverResults, object, consoleMarker, consoleTypes, phpAfterStop, final, stopped };
        } finally { runtime.close(); }
      }, fixtures);
      const persistence = await page.evaluate(async () => {
        const { NativeRuntime } = await import('/packages/runtime/src/native-runtime.mjs');
        const projectKey = 'test-' + crypto.randomUUID();
        const options = { moduleURL: new URL('/engine/pbl-runtime.mjs', location.href).href, projectKey };
        let runtime = await NativeRuntime.create(options);
        try {
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
          await runtime.shutdown();
          return { passed: true, projectKey, output, sql, scope: 'New owner worker and WASM instance in the same browser profile after explicit save' };
        } finally { runtime.close(); }
      });
      const receipt = { browser: browserName, version: browser.version(), passed: true, results, persistence };
      await writeFile(join(dist, 'receipts', `${browserName}.json`), JSON.stringify(receipt, null, 2) + '\n');
      console.log(browserName, 'native files/CGI/network/PDO/MySQLi passed');
    } finally { await browser.close(); }
  }
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
