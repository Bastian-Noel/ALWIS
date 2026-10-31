import test from 'node:test';
import assert from 'node:assert/strict';
import {RequestQueue} from '../packages/runtime/src/request-queue.mjs';
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return {promise,resolve}; };
test('requests execute sequentially and preserve FIFO', async () => {
  const q = new RequestQueue(); const gate = deferred(); const order = [];
  const a = q.run(async () => { order.push('a'); await gate.promise; order.push('A'); });
  const b = q.run(() => order.push('b'));
  await Promise.resolve(); assert.deepEqual(order, ['a']); gate.resolve();
  await Promise.all([a,b]); assert.deepEqual(order, ['a','A','b']);
});
test('count overload rejects without executing', async () => {
  const q = new RequestQueue({maxPending:1}); const gate = deferred();
  const a = q.run(() => gate.promise); const b = q.run(() => 2);
  await assert.rejects(q.run(() => assert.fail('must not run')), {code:'OVERLOADED'});
  gate.resolve(); await Promise.all([a,b]);
});
test('body byte budget includes active request', async () => {
  const q = new RequestQueue({maxBytes:3}); const gate = deferred();
  const a = q.run(() => gate.promise, {bytes:3});
  await assert.rejects(q.run(() => 2, {bytes:1}), {code:'OVERLOADED'});
  gate.resolve(); await a; assert.deepEqual(q.stats, {pending:0,running:false,bytes:0});
});
test('abort queued request releases capacity', async () => {
  const q = new RequestQueue(); const gate = deferred(); const abort = new AbortController();
  const a = q.run(() => gate.promise);
  const b = q.run(() => assert.fail('aborted task'), {bytes:2,signal:abort.signal});
  abort.abort(); await assert.rejects(b, {code:'ABORTED'});
  assert.equal(q.stats.bytes, 0); gate.resolve(); await a;
});
test('queued deadline expires and releases capacity', async () => {
  const q = new RequestQueue(); const gate = deferred(); const a = q.run(() => gate.promise);
  await assert.rejects(q.run(() => assert.fail('expired'), {bytes:2,deadline:Date.now()+20}), {code:'EXPIRED'});
  assert.equal(q.stats.bytes, 0); gate.resolve(); await a;
});
test('running abort cannot cause concurrent PHP execution', async () => {
  const q = new RequestQueue(); const gate = deferred(); const abort = new AbortController();
  let second = false;
  const a = q.run(() => gate.promise, {signal:abort.signal});
  const b = q.run(() => { second = true; }); abort.abort();
  await Promise.resolve(); assert.equal(second, false);
  gate.resolve(); await Promise.all([a,b]); assert.equal(second, true);
});
test('sync and async failures do not block following requests', async () => {
  const q = new RequestQueue();
  await assert.rejects(q.run(() => { throw new Error('sync'); }), /sync/);
  await assert.rejects(q.run(async () => { throw new Error('async'); }), /async/);
  assert.equal(await q.run(() => 42), 42); assert.equal(q.stats.bytes, 0);
});
test('invalid budgets and expired requests never enter queue', async () => {
  const q = new RequestQueue({maxPending:0});
  await assert.rejects(q.run(() => {}, {bytes:-1}), RangeError);
  await assert.rejects(q.run(() => {}, {deadline:0}), {code:'EXPIRED'});
  assert.equal(await q.run(() => 1), 1);
});
