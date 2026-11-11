import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalParity, compareParity } from '../scripts/native-parity-report.mjs';
const fixture = readFileSync(new URL('../fixtures/compatibility/native-parity.php', import.meta.url), 'utf8');
const steps = JSON.parse(readFileSync(new URL('../fixtures/compatibility/native-parity-cases.json', import.meta.url), 'utf8')).steps;
const scenarioIDs = [...new Set(steps.map(entry => entry.case))];
const receipt = (hash, browser = 'chromium') => ({ schemaVersion: 1, passed: true, browser, wasmSha256: hash,
  cases: steps.map(({ step, case: name }) => ({ step, case: name, status: name === 'error' ? 500 : 200,
    exitCode: name === 'error' ? 255 : 0,
    headers: step === 'session-new' ? ['Set-Cookie: PHPSESSID=secret; Path=/', 'Date: today'] : ['Content-Type: application/json'],
    body: name === 'environment' ? JSON.stringify({ version: '8.4.27', integerBytes: 4, pdo: true, mysqli: true, session: true })
      : name === 'error' ? 'ALWIS_PARITY_EXPECTED_ERROR' : '{"counter":1}', stderr: '' })) });

test('the parity fixture explicitly covers HTTP, sessions, files, SQL, and failures', () => {
  for (const id of scenarioIDs) assert.match(fixture, new RegExp(`case '${id}':`));
  assert.ok(fixture.includes('PDO::ATTR_EMULATE_PREPARES => false'));
  assert.ok(fixture.includes('bind_param'));
  assert.ok(fixture.includes('rollBack()') && fixture.includes('rollback()'));
  assert.ok(fixture.includes('PHP_INT_SIZE'));
});

test('canonical comparison tolerates non-semantic session tokens and PHP patch differences', () => {
  const old = receipt('a'.repeat(64));
  const fresh = receipt('b'.repeat(64));
  fresh.cases[0].body = JSON.stringify({ version: '8.4.29', integerBytes: 8, pdo: true, mysqli: true, session: true });
  fresh.cases[8].headers = ['Date: tomorrow', 'Set-Cookie: PHPSESSID=another-secret; Path=/'];
  assert.equal(compareParity(old, fresh).scenarios, steps.length);
});

test('the comparator rejects missing cases, semantic changes and identical binaries', () => {
  const old = receipt('a'.repeat(64)), fresh = receipt('b'.repeat(64));
  assert.throws(() => compareParity(old, old), /identical|matches historical/);
  fresh.cases.pop();
  assert.throws(() => compareParity(old, fresh), /Missing or invalid/);
  fresh.cases.push({ ...old.cases.at(-1) });
  fresh.cases[9].body = '{"counter":2}';
  assert.throws(() => compareParity(old, fresh), /mismatch/);
  assert.equal(canonicalParity(old).length, steps.length);
});
