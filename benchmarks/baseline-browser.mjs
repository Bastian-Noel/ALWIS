/** Measure compiled upstream PHP + its pinned MariaDB bridge in real browsers.
 * Run from a joomengine/php-wasm checkout containing dist/php/8.4.
 * Does not patch either engine. Reports missing memory APIs explicitly.
 */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import { readBrowserProcessMemory } from './browser-process-memory.mjs';
import { createHash } from 'node:crypto';

const root = process.cwd();
const localImport = name => import(pathToFileURL(join(root, name)).href);
const playwright = await localImport('node_modules/playwright/index.mjs');
const { serveDatabase } = await localImport('test/database-helpers.mjs');
const { engineOptions } = await localImport('test/helpers.mjs');
const output = resolve(process.env.BENCHMARK_OUTPUT ?? '../../benchmarks/results');
await mkdir(output, { recursive: true });
const catalog = JSON.parse(await readFile(join(root, 'versions.json'), 'utf8'));
const hash = path => readFile(path).then(bytes => createHash('sha256').update(bytes).digest('hex'));
const metadata = {
  schemaVersion: 1, measuredAt: new Date().toISOString(),
  sourceCommit: '3b8cef42c020fbcbb6b41fad86716b7c8664b55b',
  php: catalog.php['8.4'], bridge: catalog.extensions.pdo_mariadb_wasm,
  engineSha256: await hash(join(root, 'dist/php/8.4/php.wasm')),
  harnessSha256: await hash(new URL(import.meta.url)),
  host: { platform: os.platform(), release: os.release(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, totalMemoryBytes: os.totalmem(), freeMemoryBytes: os.freemem(), node: process.version },
  limitations: ['Headless CI environment; not a target-device performance guarantee.', 'Startup includes worker creation, fetch and instantiation; server disables HTTP cache.', 'Browser API memory is not linear WASM size; Linux PSS is aggregate browser process memory (not WASM heap) and may be unavailable.'],
};
for (const browserName of (process.env.PHP_WASM_BROWSERS ?? 'chromium,firefox').split(',')) {
  assert.ok(['chromium', 'firefox'].includes(browserName));
  const server = await serveDatabase();
  let browser;
  const report = { ...metadata, browser: browserName, status: 'running', samples: [] };
  try {
    browser = await playwright[browserName].launch({ headless: true, ...(browserName === 'chromium' ? { args: ['--no-sandbox'] } : {}) });
    report.browserVersion = browser.version();
    const context = await browser.newContext();
    const page = await context.newPage();
    // Browser workers are Node child processes on this Linux runner.
    // The binding persists across per-sample page navigations.
    await page.exposeFunction('__browserProcessMemory', () => readBrowserProcessMemory(process.pid));
    page.setDefaultTimeout(180_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const options = await engineOptions(server.url, { manifest: false });
    for (let sample = 0; sample < 3; sample++) {
      await page.goto(server.url);
      const result = await page.evaluate(async ({ options, sample }) => {
        const { createPHP } = await import('/src/index.mjs');
        const { createMariaDB } = await import('/mariadb/src/index.mjs');
        const now = () => performance.now();
        const decode = bytes => new TextDecoder().decode(bytes);
        const browserApiMemory = async () => {
          if (typeof performance.measureUserAgentSpecificMemory !== 'function') return { available: false, reason: 'API unavailable' };
          let timer;
          try {
            return await Promise.race([
              performance.measureUserAgentSpecificMemory().then(value => ({ available: true, bytes: value.bytes, breakdown: value.breakdown })),
              new Promise(resolve => { timer = setTimeout(() => resolve({ available: false, reason: 'Measurement exceeded 5 seconds' }), 5000); }),
            ]);
          } catch (error) { return { available: false, reason: error.message }; }
          finally { clearTimeout(timer); }
        };
        const memory = async () => ({
          ...await browserApiMemory(),
          linuxProcessTree: await window.__browserProcessMemory(),
        });
        const measureRuns = async (php, code, count) => {
          await php.fs.writeFile('/workspace/bench.php', code);
          const request = () => php.request({ script: '/workspace/bench.php', url: new URL('/bench.php', location.href).href });
          const warmup = await request();
          if (warmup.exitCode !== 0 || warmup.status !== 200) throw new Error(decode(warmup.stderr));
          const times = [];
          for (let i = 0; i < count; i++) {
            const started = now();
            const response = await request();
            times.push(now() - started);
            if (response.exitCode !== 0 || response.status !== 200 || decode(response.body) !== 'ok') throw new Error(`Invalid benchmark response: ${decode(response.stderr)} ${decode(response.body)}`);
          }
          const sorted = [...times].sort((a, b) => a - b);
          return { milliseconds: times, p50: sorted[Math.ceil(sorted.length * .5) - 1], p95: sorted[Math.ceil(sorted.length * .95) - 1] };
        };
        const result = { sample, isolated: crossOriginIsolated, memoryBefore: await memory() };
        let php;
        let db;
        try {
          let started = now();
          php = await createPHP(options);
          result.phpOnlyStartupMs = now() - started;
          result.phpOnly = await measureRuns(php, '<?php echo "ok";', 30);
          result.memoryPhpOnly = await memory();
          await php.close(); php = undefined;
          const persistence = { key: `baseline-${crypto.randomUUID()}` };
          started = now();
          db = await createMariaDB({ database: 'joomla', persistence });
          result.sqlStartupMs = now() - started;
          const call = async request => {
            const response = JSON.parse(await db.hostCalls['mariadb.v1'](JSON.stringify({ version: 1, ...request })));
            if (!response.ok) throw new Error(JSON.stringify(response.error));
            return response.result;
          };
          const { connection } = await call({ op: 'connect', database: 'joomla', user: 'root', password: '' });
          const consoleConnection = {
            query: sql => call({ op: 'query', connection, sql }),
            close: () => call({ op: 'close', connection }),
          };
          const sqlTimes = [];
          for (let i = 0; i < 30; i++) {
            const start = now();
            const row = await consoleConnection.query('SELECT 1 AS value');
            if (row.rows?.[0]?.[0] !== 'MQ==') throw new Error('Invalid SQL-only result');
            sqlTimes.push(now() - start);
          }
          const sortedSql = [...sqlTimes].sort((a, b) => a - b);
          result.sqlOnly = { milliseconds: sqlTimes, p50: sortedSql[Math.ceil(sortedSql.length * .5) - 1], p95: sortedSql[Math.ceil(sortedSql.length * .95) - 1] };
          result.memorySqlOnly = await memory();
          // The pinned JoomEngine v0.1.1 bridge allows one active SQL lease.
          // Release the SQL-only console lease BEFORE the first PDO request.
          await consoleConnection.close();
          started = now();
          php = await createPHP({ ...options, hostCalls: db.hostCalls });
          result.phpWithSqlStartupMs = now() - started;
          result.memoryPhpWithSqlStarted = await memory();
          result.phpSql = {};
          for (const count of [1, 10, 100]) {
            result.phpSql[count] = await measureRuns(php, `<?php $db = new PDO('mysql:dbname=joomla;charset=utf8mb4', 'root', ''); for ($i=0; $i<${count}; $i++) { if ((string)$db->query('SELECT 42')->fetchColumn() !== '42') throw new RuntimeException('Bad SQL result'); } echo 'ok';`, 20);
          }
          // Keep the JoomEngine v0.1.1 baseline sequential: persistence is
          // written through PDO, not through a simultaneous console lease.
          await php.fs.writeFile('/workspace/persist.php', '<?php $db = new PDO("mysql:dbname=joomla;charset=utf8mb4", "root", ""); $db->exec("CREATE TABLE benchmark_persist (id INT PRIMARY KEY, value VARCHAR(30)) ENGINE=InnoDB"); $db->exec("INSERT INTO benchmark_persist VALUES (1, \'persisted\')"); echo "ok";');
          const persisted = await php.request({ script: '/workspace/persist.php', url: new URL('/persist.php', location.href).href });
          if (persisted.exitCode !== 0 || persisted.status !== 200 || decode(persisted.body) !== 'ok') throw new Error(`Persistence write failed: ${decode(persisted.stderr)} ${decode(persisted.body)}`);
          result.memoryCombined = await memory();
          started = now(); await db.flush(); result.flushMs = now() - started;
          await php.close(); php = undefined;
          started = now(); await db.close(); db = undefined; result.sqlCloseMs = now() - started;
          result.memoryAfterClose = await memory();
          started = now(); db = await createMariaDB({ database: 'joomla', persistence }); result.sqlRestoreMs = now() - started;
          php = await createPHP({ ...options, hostCalls: db.hostCalls });
          await php.fs.writeFile('/workspace/restored.php', "<?php $db = new PDO('mysql:dbname=joomla', 'root', ''); echo $db->query('SELECT value FROM benchmark_persist WHERE id=1')->fetchColumn();");
          const restored = await php.run({ script: '/workspace/restored.php' });
          if (restored.exitCode !== 0 || decode(restored.stdout) !== 'persisted') throw new Error('Persistence validation failed');
          result.persistenceVerified = true;
        } finally {
          try { await php?.close(); } finally { await db?.close(); }
        }
        return result;
      }, { options, sample });
      report.samples.push(result);
      await writeFile(join(output, `${browserName}.json`), JSON.stringify(report, null, 2) + '\n');
    }
    assert.deepEqual(errors, []);
    report.status = 'passed';
    await context.close();
  } catch (error) {
    report.status = 'failed'; report.error = { message: error.message, stack: error.stack };
    process.exitCode = 1;
  } finally {
    try { await browser?.close(); } finally { await server.close(); }
    await writeFile(join(output, `${browserName}.json`), JSON.stringify(report, null, 2) + '\n');
    console.log(`${browserName}: ${report.status}, ${report.samples.length} samples`);
  }
}
