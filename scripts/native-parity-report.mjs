/** Compare browser receipts from an immutable historical witness and a GPLv2 candidate.
 * Dynamic session IDs and PHP patch versions are reported, not compared byte-for-byte.
 */
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const expectedSteps = JSON.parse(readFileSync(new URL('../fixtures/compatibility/native-parity-cases.json', import.meta.url), 'utf8')).steps;

const relevantHeaders = new Set(['content-type', 'location', 'x-alwis-parity']);
export function canonicalParity(receipt) {
  if (!receipt || receipt.schemaVersion !== 1 || receipt.passed !== true ||
      !/^[a-f0-9]{64}$/.test(receipt.wasmSha256 ?? '') || !Array.isArray(receipt.cases) || receipt.cases.length !== expectedSteps.length)
    throw Error('Missing or invalid native browser parity receipt');
  return receipt.cases.map((record, index) => {
    if (!record || record.case !== expectedSteps[index].case || record.step !== expectedSteps[index].step)
      throw Error('Missing, reordered or duplicate parity step: ' + expectedSteps[index].step);
    let body;
    try { body = JSON.parse(record.body); } catch { body = record.body; }
    if (record.case === 'environment' && body && typeof body === 'object') {
      body = { ...body, version: String(body.version).split('.').slice(0, 2).join('.') };
      delete body.integerBytes; // PHP 64-bit integers are explicitly out of migration scope
    }
    if (record.case === 'error') {
      body = 'ALWIS_PARITY_EXPECTED_ERROR';
      if ((record.exitCode === 0 || record.exitCode == null) && !(record.status >= 500))
        throw Error('Parity error case was reported as success');
      if (!String(record.stderr ?? '').concat(String(record.body ?? '')).includes('ALWIS_PARITY_EXPECTED_ERROR'))
        throw Error('Parity error marker missing');
    }
    const headers = (record.headers ?? []).flatMap(line => {
      const colon = line.indexOf(':');
      if (colon <= 0) return [];
      const name = line.slice(0, colon).toLowerCase();
      if (name === 'set-cookie') return ['set-cookie:' + line.slice(colon + 1).trim().split('=')[0].toLowerCase()];
      if (!relevantHeaders.has(name)) return [];
      return [name + ':' + line.slice(colon + 1).trim()];
    }).sort();
    return { id: record.step, status: record.case === 'error' ? 'error' : record.status,
      body, headers };
  });
}
export function compareParity(historical, candidate) {
  if (historical.browser !== candidate.browser) throw Error('Compare the same browser on both WASM builds');
  if (historical.wasmSha256 === candidate.wasmSha256) throw Error('Candidate matches historical WASM bytes: no independent build evidenced');
  const left = canonicalParity(historical), right = canonicalParity(candidate);
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    const difference = left.findIndex((item, index) => JSON.stringify(item) !== JSON.stringify(right[index]));
    throw Error('Native parity mismatch at case ' + (left[difference]?.id ?? right[difference]?.id ?? 'missing'));
  }
  return { browser: historical.browser, scenarios: left.length,
    historicalWasmSha256: historical.wasmSha256, candidateWasmSha256: candidate.wasmSha256,
    integerBytes: { historical: historical.cases.find(c => c.case === 'environment')?.body,
      candidate: candidate.cases.find(c => c.case === 'environment')?.body } };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (process.argv.length !== 4) throw Error('Usage: node scripts/native-parity-report.mjs historical.json candidate.json');
  const [historical, candidate] = await Promise.all(process.argv.slice(2).map(async path => JSON.parse(await readFile(path, 'utf8'))));
  const summary = compareParity(historical, candidate);
  console.log('Native PHP/HTTP/SQL parity passed:', summary.browser, summary.scenarios, 'scenarios');
  console.log('Historical WASM SHA-256:', summary.historicalWasmSha256);
  console.log('Candidate WASM SHA-256:', summary.candidateWasmSha256);
}
