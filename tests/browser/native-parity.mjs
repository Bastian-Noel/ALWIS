/** Execute exactly the same PHP/HTTP/PDO/MySQLi scenarios against either native WASM.
 * Usage (after installing Playwright browsers):
 *   ALWIS_PARITY_LABEL=historical node tests/browser/native-parity.mjs chromium,firefox
 *   ALWIS_PARITY_RUNTIME_DIST=/absolute/candidate/runtime-dist ALWIS_PARITY_LABEL=candidate node tests/browser/native-parity.mjs chromium,firefox
 * Only local disposable runtimes are used. No redistribution or production deployment.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createStudioServer } from '../../scripts/serve-studio.mjs';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const engineDist = resolve(process.env.ALWIS_PARITY_RUNTIME_DIST ?? join(root, 'build-work/bridge/.native-build/engine/wasm/runtime-dist'));
const label = process.env.ALWIS_PARITY_LABEL ?? 'historical';
if (!/^[A-Za-z0-9_-]{1,40}$/.test(label)) throw Error('Invalid parity label');
const wasm = await readFile(join(engineDist, 'pbl-runtime.wasm'));
const nativeJS = await readFile(join(engineDist, 'pbl-runtime.mjs'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fingerprint = { wasmSha256: sha256(wasm), nativeJsSha256: sha256(nativeJS), wasmBytes: wasm.byteLength };
const fixture = await readFile(join(root, 'fixtures/compatibility/native-parity.php'), 'utf8');
const pw = await import(pathToFileURL(join(root, 'build-work/php/node_modules/playwright/index.mjs')).href);
const server = createStudioServer({ engineDist });
await new Promise((resolveListen, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolveListen);
});
try {
  for (const name of (process.argv[2] ?? 'chromium,firefox').split(',')) {
    if (!['chromium', 'firefox'].includes(name)) throw Error('Unknown browser: ' + name);
    const browser = await pw[name].launch({ headless: true, ...(name === 'chromium' ? { args: ['--no-sandbox'] } : {}) });
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(90_000);
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      const result = await page.evaluate(async ({ source, postHash }) => {
        const { NativeRuntime } = await import('/packages/runtime/src/native-runtime.mjs');
        const runtime = await NativeRuntime.create({ moduleURL: new URL('/engine/pbl-runtime.mjs', location.href).href });
        const decoder = new TextDecoder(), cases = [];
        const expect = (ok, reason) => { if (!ok) throw Error('Parity: ' + reason); };
        const header = (response, name) => (response.headers ?? []).find(line => line.toLowerCase().startsWith(name.toLowerCase() + ':'))?.slice(name.length + 1).trim();
        const request = async (id, { method = 'GET', headers = [], body, query = {}, step = id } = {}) => {
          const url = new URL('/native-parity.php', location.href);
          url.searchParams.set('case', id);
          for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
          const response = await runtime.request({ script: '/workspace/native-parity.php', url: url.href, method, headers, ...(body === undefined ? {} : { body }) });
          const raw = decoder.decode(response.body);
          const stderr = decoder.decode(response.stderr ?? new Uint8Array());
          const safeHeaders = (response.headers ?? []).map(line => /^set-cookie:/i.test(line)
            ? line.replace(/^(set-cookie:\s*[^=]+)=([^;]*)/i, '$1=<redacted>') : line);
          cases.push({ case: id, step, status: response.status, exitCode: response.exitCode, headers: safeHeaders, body: raw.slice(0, 2048), stderr: stderr.slice(0, 2048) });
          return { response, data: (() => { try { return JSON.parse(raw); } catch { return null; } })(), raw, stderr };
        };
        const json = async (id, options) => {
          const value = await request(id, options);
          expect(value.response.exitCode === 0 && !value.stderr, `${id} native failure: ${value.stderr}`);
          expect(value.data !== null, `${id} has non-JSON response: ${value.raw}`);
          return value;
        };
        try {
          await runtime.write('/workspace/native-parity.php', source);
          const env = (await json('environment')).data;
          expect(/^8\.4\./.test(env.version), `PHP is not 8.4: ${env.version}`);
          expect([4, 8].includes(env.integerBytes), 'nonstandard PHP integer width');
          expect(env.pdo && env.mysqli && env.session, 'required PHP extensions missing');
          const get = (await json('get', { headers: [['X-Parity-Probe', 'probe-yes']], query: { text: 'été 😀' } })).data;
          expect(get.method === 'GET' && get.query === 'été 😀' && get.header === 'probe-yes' && get.path === '/native-parity.php', 'GET, query or $_SERVER');
          const payload = 'value=%C3%A9t%C3%A9';
          const post = (await json('post', { method: 'POST', headers: [['Content-Type', 'application/x-www-form-urlencoded']], body: payload })).data;
          expect(post.method === 'POST' && post.value === 'été' && post.rawHash === postHash,
            'POST and php://input: ' + JSON.stringify({ method: post.method, value: post.value,
              expectedHash: postHash, rawHash: post.rawHash }));
          const binary = (await json('binary', { method: 'POST', headers: [['Content-Type', 'application/octet-stream']], body: Uint8Array.from([0, 127, 128, 255, 10]) })).data;
          expect(binary.length === 5 && binary.hex === '007f80ff0a', 'binary POST fidelity');
          const headers = await json('headers');
          expect(headers.response.status === 201 && header(headers.response, 'X-ALWIS-Parity') === 'header-ok', 'custom status/headers');
          const redirect = await request('redirect');
          expect(redirect.response.status === 302 && header(redirect.response, 'Location') === '/parity-finished.php?proof=1', 'HTTP redirect');
          const cookieFirst = await json('cookie', { step: 'cookie-issued' });
          const cookieLine = header(cookieFirst.response, 'Set-Cookie');
          expect(cookieFirst.data.seen === null && cookieLine?.startsWith('alwis_parity=issued'), 'cookie response');
          const cookieSecond = (await json('cookie', { step: 'cookie-returned', headers: [['Cookie', 'alwis_parity=issued']] })).data;
          expect(cookieSecond.seen === 'issued', 'cookie input');
          const one = await json('session', { step: 'session-new' });
          const phpCookie = header(one.response, 'Set-Cookie')?.split(';')[0];
          expect(one.data.counter === 1 && one.data.sessionIdPresent && /^PHPSESSID=/.test(phpCookie ?? ''), 'new PHP session');
          const two = (await json('session', { step: 'session-resume', headers: [['Cookie', phpCookie]] })).data;
          expect(two.counter === 2, 'PHP session persistence');
          const other = (await json('session', { step: 'session-other' })).data;
          expect(other.counter === 1, 'PHP session isolation');
          const write = (await json('file-write')).data;
          expect(write.written === 5 && write.hex === '007f80ff0a', 'binary filesystem write');
          const read = (await json('file-read')).data;
          expect(read.hex === '007f80ff0a' && read.removed === true, 'filesystem persistence/cleanup');
          const pdo = (await json('pdo')).data;
          expect(pdo.label === 'été 😀' && pdo.hex === '00ff' && pdo.transactionClosed, 'PDO native prepare and rollback');
          const mysqli = (await json('mysqli')).data;
          expect(mysqli.label === 'été 😀' && mysqli.hex === '00ff' && mysqli.rolledBack, 'MySQLi prepared query and rollback');
          const cleanup = (await json('sql-cleanup')).data;
          expect(cleanup.cleaned, 'SQL cleanup');
          const error = await request('error');
          expect(error.response.exitCode !== 0 || error.response.status >= 500, 'uncaught PHP exception reported as successful');
          expect((error.stderr + error.raw).includes('ALWIS_PARITY_EXPECTED_ERROR'), 'PHP error diagnostic unavailable');
          const state = await runtime.state();
          expect(!state.sqlConnections && !state.nativeStatements, 'SQL connection or statement leaked after request');
          return { passed: true, cases, state: { sqlConnections: state.sqlConnections, nativeStatements: state.nativeStatements, integerBytes: env.integerBytes } };
        } catch (error) {
          // Preserve a test-only, sanitized trace of successful/failed probes.
          // This receipt is NOT validation and cannot authorize a release.
          return { passed: false, error: String(error?.message ?? error), cases };
        } finally { runtime.close(); }
      }, { source: fixture, postHash: sha256(Buffer.from('value=%C3%A9t%C3%A9')) });
      const output = join(root, 'build-work/parity', `${label}-${name}.json`);
      await mkdir(resolve(output, '..'), { recursive: true });
      await writeFile(output, JSON.stringify({ schemaVersion: 1, label, browser: name, browserVersion: browser.version(), ...fingerprint, ...result }, null, 2) + '\n');
      if (!result.passed) throw Error('Native parity incomplete in ' + name + ': ' + result.error +
        '; last probe: ' + JSON.stringify(result.cases.at(-1)));
      console.log(name, label, result.cases.length, 'native parity probes passed for WASM', fingerprint.wasmSha256);
    } finally { await browser.close(); }
  }
} finally {
  server.closeAllConnections();
  await new Promise(resolveClose => server.close(resolveClose));
}
