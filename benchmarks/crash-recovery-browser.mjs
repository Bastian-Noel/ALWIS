/** Reopen a flushed SQL snapshot after abrupt page/worker destruction.
 * Does not test power loss or durability of unflushed commits.
 * Run from the prepared pinned JoomEngine PHP checkout.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const local = name => import(pathToFileURL(join(process.cwd(), name)).href);
const playwright = await local('node_modules/playwright/index.mjs');
const { serveDatabase } = await local('test/database-helpers.mjs');
const sha256 = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const source = JSON.parse(await readFile(join(process.cwd(), 'versions.json'), 'utf8')).extensions.pdo_mariadb_wasm;
const provenance = { bridgeSource: source, wasmSha256: await sha256(join(process.cwd(), '.build/mariadb-bridge/vendor/lite4mariadb/lite4mariadb.wasm')), harnessSha256: await sha256(new URL(import.meta.url)) };
const output = resolve(process.env.BENCHMARK_OUTPUT ?? '../../benchmarks/results/crash');
await mkdir(output, { recursive: true });
for (const browserName of (process.env.PHP_WASM_BROWSERS ?? 'chromium,firefox').split(',')) {
  assert.ok(['chromium', 'firefox'].includes(browserName));
  const server = await serveDatabase();
  const report = { ...provenance, browser: browserName, status: 'running', scenario: 'Flush committed row, begin an uncommitted transaction, destroy page without db.close, reopen in same browser context',
    limitation: 'Flushed snapshot restoration only; not unflushed commit durability, interruption during syncfs or physical power loss.' };
  let browser;
  try {
    browser = await playwright[browserName].launch({ headless: true, ...(browserName === 'chromium' ? { args: ['--no-sandbox'] } : {}) });
    report.browserVersion = browser.version();
    const context = await browser.newContext();
    let page = await context.newPage();
    page.setDefaultTimeout(180000);
    const key = `crash-${crypto.randomUUID()}`;
    await page.goto(server.url);
    await page.evaluate(async key => {
      const { createMariaDB } = await import('/mariadb/src/index.mjs');
      const db = await createMariaDB({ database: 'joomla', persistence: { key } });
      const call = async args => {
        const r = JSON.parse(await db.hostCalls['mariadb.v1'](JSON.stringify({ version: 1, ...args })));
        if (!r.ok) throw Error(JSON.stringify(r.error));
        return r.result;
      };
      const { connection } = await call({ op: 'connect', database: 'joomla', user: 'root', password: '' });
      const query = sql => call({ op: 'query', connection, sql });
      await query('CREATE TABLE crash_check (id INT PRIMARY KEY, value VARCHAR(20)) ENGINE=InnoDB');
      await query("INSERT INTO crash_check VALUES (1, 'committed')");
      await db.flush();
      await query('START TRANSACTION');
      await query("INSERT INTO crash_check VALUES (2, 'uncommitted')");
      globalThis.__crashDatabase = db; // Intentionally keep resources live until page.close.
    }, key);
    report.flushAcknowledged = true;
    await page.close(); // No db.close, flush or PHP/native destructor here.
    page = await context.newPage();
    page.setDefaultTimeout(180000);
    await page.goto(server.url);
    const rows = await page.evaluate(async key => {
      const { createMariaDB } = await import('/mariadb/src/index.mjs');
      const db = await createMariaDB({ database: 'joomla', persistence: { key } });
      try {
        const call = async args => {
          const r = JSON.parse(await db.hostCalls['mariadb.v1'](JSON.stringify({ version: 1, ...args })));
          if (!r.ok) throw Error(JSON.stringify(r.error));
          return r.result;
        };
        const { connection } = await call({ op: 'connect', database: 'joomla', user: 'root', password: '' });
        const result = await call({ op: 'query', connection, sql: 'SELECT id, value FROM crash_check ORDER BY id' });
        await call({ op: 'close', connection });
        return result.rows;
      } finally { await db.close(); }
    }, key);
    assert.deepEqual(rows, [['MQ==', 'Y29tbWl0dGVk']], 'Flushed committed row restored; uncommitted row absent');
    report.rows = rows; report.status = 'passed';
    await context.close();
  } catch (error) {
    report.status = 'failed'; report.error = { message: error.message, stack: error.stack };
    process.exitCode = 1;
  } finally {
    try { await browser?.close(); } finally { await server.close(); }
    await writeFile(join(output, `${browserName}.json`), JSON.stringify(report, null, 2) + '\n');
    console.log(`${browserName}: ${report.status}`);
  }
}
