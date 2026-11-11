import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForAsyncCondition} from './browser/async-condition.mjs';

test('browser polling waits for asynchronous false results before succeeding', async () => {
  let calls = 0;
  const page = {evaluate: async (predicate, arg) => predicate(arg)};
  const result = await waitForAsyncCondition(page, async value => {
    await Promise.resolve();
    return ++calls === 3 && value;
  }, 'ready', {timeout: 1000, polling: 1});
  assert.equal(result, 'ready');
  assert.equal(calls, 3);
});

test('browser polling rejects when the asynchronous condition stays false', async () => {
  const page = {evaluate: async () => false};
  await assert.rejects(waitForAsyncCondition(page, () => false, null, {timeout: 10, polling: 1}), /not met/);
});
