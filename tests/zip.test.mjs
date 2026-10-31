import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeZip, readZip } from '../apps/studio/zip.mjs';
test('ZIP roundtrip preserves Unicode paths, zero bytes and binary payloads', async () => {
  const entries = [{ name: 'école/index.php', bytes: Uint8Array.of(65, 0, 255) }, { name: 'empty.txt', bytes: new Uint8Array() }];
  assert.deepEqual(await readZip(makeZip(entries)), entries);
});
test('ZIP rejects traversal, duplicate paths and corrupt file CRC', async () => {
  assert.throws(() => makeZip([{ name: '../escape', bytes: Uint8Array.of(1) }]));
  assert.throws(() => makeZip([{ name: 'same', bytes: new Uint8Array() }, { name: 'same', bytes: new Uint8Array() }]));
  const archive = makeZip([{ name: 'x', bytes: Uint8Array.of(1) }]); archive[31] ^= 255;
  await assert.rejects(readZip(archive), /Intégrité/);
});

test('ZIP imports a Python zipfile DEFLATE archive', async () => {
  const archive = new Uint8Array(Buffer.from('UEsDBBQAAAAIAAAAX10mWW7xHQAAALgBAAAPAAAAZWNvbGUvaW5kZXgucGhws7EvyChQSE3OyFdQcsrPy8ovLVKy5rIZFR3kogBQSwECFAMUAAAACAAAAF9dJllu8R0AAAC4AQAADwAAAAAAAAAAAAAAgAEAAAAAZWNvbGUvaW5kZXgucGhwUEsFBgAAAAABAAEAPQAAAEoAAAAAAA==', 'base64'));
  const entries = await readZip(archive);
  assert.equal(entries[0].name, 'ecole/index.php');
  assert.equal(new TextDecoder().decode(entries[0].bytes), '<?php echo \"Bonjour\";\n'.repeat(20));
});
