/** Real browser test. Usage: node test-browser.mjs DIST PLAYWRIGHT_INDEX [chromium,firefox] */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, copyFile, writeFile } from 'node:fs/promises';
import { resolve, extname, sep, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const dist = resolve(process.argv[2]);
const playwright = await import(pathToFileURL(resolve(process.argv[3])).href);
await copyFile(new URL('./worker.mjs', import.meta.url), join(dist, 'worker.mjs'));
const server = createServer(async (request, response) => {
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  response.setHeader('Cache-Control', 'no-store');
  if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Fusion spike</title>'); return; }
  const file = resolve(dist, '.' + new URL(request.url, 'http://localhost').pathname);
  if (!file.startsWith(dist + sep)) { response.writeHead(403).end(); return; }
  try {
    response.setHeader('Content-Type', extname(file) === '.wasm' ? 'application/wasm' : 'text/javascript');
    response.end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
try {
  for (const name of (process.argv[4] ?? 'chromium,firefox').split(',')) {
    assert.ok(['chromium', 'firefox'].includes(name));
    const browser = await playwright[name].launch({ headless: true, ...(name === 'chromium' ? { args: ['--no-sandbox'] } : {}) });
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(180000);
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      const result = await page.evaluate(() => new Promise((resolve, reject) => {
        if (!crossOriginIsolated) return reject(Error('Shared memory requires isolation'));
        const worker = new Worker('/worker.mjs', { type: 'module' });
        const timer = setTimeout(() => { worker.terminate(); reject(Error('Fusion worker timed out after 180 seconds')); }, 180000);
        worker.onmessage = event => { clearTimeout(timer); worker.terminate(); resolve(event.data); };
        worker.onerror = event => { clearTimeout(timer); worker.terminate(); reject(Error(event.message)); };
      }));
      assert.equal(result.ok, true, JSON.stringify(result));
      await writeFile(join(dist, `${name}-receipt.json`), JSON.stringify({ browser: name, version: browser.version(), ...result }, null, 2) + '\n');
      console.log(name, JSON.stringify(result));
    } finally { await browser.close(); }
  }
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
