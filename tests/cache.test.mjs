import test from 'node:test';
import assert from 'node:assert/strict';
import {ByteLru} from '../packages/files/src/byte-lru.mjs';
const bytes = (...n) => new Uint8Array(n);
test('LRU eviction follows reads and respects byte cap', () => {
  const c = new ByteLru(4); c.set('a', bytes(1,2)); c.set('b', bytes(3,4));
  c.get('a'); c.set('c', bytes(5,6));
  assert.equal(c.get('b'), undefined); assert.equal(c.bytes, 4);
  assert.deepEqual(c.get('a'), bytes(1,2));
});
test('replacement and deletion maintain accounting', () => {
  const c = new ByteLru(8); c.set('x', bytes(1,2,3)); c.set('x', bytes(4));
  assert.equal(c.bytes, 1); c.delete('x'); c.delete('missing'); assert.equal(c.bytes, 0);
});
test('oversized updated file invalidates stale cache entry', () => {
  const c = new ByteLru(1); c.set('x', bytes(1));
  assert.equal(c.set('x', bytes(1,2)), false); assert.equal(c.get('x'), undefined);
});
test('input and output mutations cannot corrupt cached source', () => {
  const c = new ByteLru(8); const source = bytes(1,2); c.set('x', source);
  source[0] = 8; const found = c.get('x'); found[1] = 9;
  assert.deepEqual(c.get('x'), bytes(1,2));
});
test('small views do not retain large original buffers', () => {
  const c = new ByteLru(8); c.set('x', new Uint8Array(1024).subarray(0,2));
  assert.equal(c.get('x').buffer.byteLength, 2);
});
test('entry cap bounds empty-file metadata; disabled cache stores nothing', () => {
  const c = new ByteLru(4, 2);
  for (const key of ['a','b','c']) c.set(key, bytes());
  assert.equal(c.size, 2); assert.equal(c.get('a'), undefined);
  assert.equal(new ByteLru(0).set('a', bytes()), false);
});
