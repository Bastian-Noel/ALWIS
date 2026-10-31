import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runBrowserSamples } from '../benchmarks/browser-samples.mjs';

function fixture() {
  const events = [];
  let serial = 0;
  return { events, launch: async () => {
    const id = ++serial;
    events.push(['launch', id]);
    return { id, close: async () => events.push(['close', id]) };
  } };
}

test('cold samples close each browser before launching its replacement', async () => {
  const f = fixture();
  await runBrowserSamples({ ...f, measure: async (browser, sample) => {
    f.events.push(['measure', browser.id, sample]);
    return sample;
  }, onSample: async value => f.events.push(['save', value]) });
  assert.deepEqual(f.events, [
    ['launch', 1], ['measure', 1, 0], ['save', 0], ['close', 1],
    ['launch', 2], ['measure', 2, 1], ['save', 1], ['close', 2],
    ['launch', 3], ['measure', 3, 2], ['save', 2], ['close', 3],
  ]);
});

test('warm samples reuse one browser and still close it', async () => {
  const f = fixture();
  const ids = [];
  await runBrowserSamples({ ...f, isolation: 'warm', measure: async browser => ids.push(browser.id) });
  assert.deepEqual(ids, [1, 1, 1]);
  assert.deepEqual(f.events, [['launch', 1], ['close', 1]]);
});

for (const isolation of ['cold', 'warm']) {
  for (const phase of ['measure', 'save']) {
    test(`${isolation} sample closes browser and propagates ${phase} failure`, async () => {
      const f = fixture();
      const error = new Error('intentional ' + phase + ' failure');
      await assert.rejects(runBrowserSamples({ ...f, isolation,
        measure: async () => { if (phase === 'measure') throw error; return 0; },
        onSample: async () => { if (phase === 'save') throw error; },
      }), value => value === error);
      assert.deepEqual(f.events, [['launch', 1], ['close', 1]]);
    });
  }
}

test('invalid sample configuration fails before launching a browser', async () => {
  const f = fixture();
  for (const options of [{ sampleCount: 0 }, { sampleCount: 1.5 }, { isolation: 'other' }]) {
    await assert.rejects(runBrowserSamples({ ...f, ...options, measure: async () => {} }));
  }
  assert.deepEqual(f.events, []);
});
