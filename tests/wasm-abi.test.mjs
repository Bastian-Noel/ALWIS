import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = resolve('scripts/inspect-wasm-abi.mjs');
const modules = {
  // Minimal real WebAssembly binaries. These are parser fixtures, NOT PHP/MariaDB mocks.
  defined: Buffer.from('0061736d01000000050401010102070a01066d656d6f72790200', 'hex'),
  imported: Buffer.from('0061736d0100000002100103656e76066d656d6f727902030102', 'hex'),
};
test('binary ABI inspector identifies private exported and shared imported WASM memory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wasm-abi-test-'));
  try {
    const files = [];
    for (const [key, bytes] of Object.entries(modules)) {
      const filename = join(dir, key + '.wasm');
      await writeFile(filename, bytes); files.push(filename);
    }
    for (const [idx, filename] of files.entries()) {
      const r = spawnSync(process.execPath, [script, filename], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      const report = JSON.parse(r.stdout);
      assert.equal(report.bytes, modules[idx === 0 ? 'defined' : 'imported'].length);
      if (idx === 0) {
        assert.deepEqual(report.definedMemories, [{ minPages: 1, maxPages: 2, shared: false, minBytes: 65536, maxBytes: 131072 }]);
        assert.deepEqual(report.exportedMemories, ['memory']);
      } else {
        assert.deepEqual(report.memoryImports, [{ module: 'env', name: 'memory', minPages: 1, maxPages: 2, shared: true, minBytes: 65536, maxBytes: 131072 }]);
        assert.deepEqual(report.exportedMemories, []);
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('binary ABI inspector rejects files with invalid WASM headers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wasm-abi-invalid-'));
  try {
    const filename = join(dir, 'invalid.wasm');
    await writeFile(filename, Buffer.from('not-wasm'));
    const result = spawnSync(process.execPath, [script, filename], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Not a WebAssembly v1 module/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
