import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpFrameFlow, HTTP_WINDOW_FRAMES, frameNeedsAck } from '../apps/studio/collab/http-flow.mjs';
import { httpFrames } from '../apps/studio/collab/http-frames.mjs';

const frames = (id, length = 170_000) => httpFrames('http-response', id, { status: 200, headers: [] }, new Uint8Array(length));
const tick = () => new Promise(resolve => setImmediate(resolve));

test('binary transfer uses an eight-frame acknowledgement window', async () => {
  const sent = [];
  const flow = new HttpFrameFlow({ send: (_peer, frame) => { sent.push(frame); return true; } });
  const all = frames(9);
  const running = flow.transfer('alice', all);
  assert.equal(sent.length, HTTP_WINDOW_FRAMES);
  assert.equal(frameNeedsAck(sent.at(-1)), true);
  assert.equal(flow.acknowledge('bob', { t: 'http-ack', kind: 'http-response', id: 9, part: 7 }), false);
  assert.equal(flow.acknowledge('alice', { t: 'http-ack', kind: 'http-request', id: 9, part: 7 }), false);
  assert.equal(flow.acknowledge('alice', { t: 'http-ack', kind: 'http-response', id: 9, part: 6 }), false);
  assert.equal(sent.length, HTTP_WINDOW_FRAMES);
  for (let start = 0; start < all.length; start += HTTP_WINDOW_FRAMES) {
    const end = Math.min(start + HTTP_WINDOW_FRAMES, all.length);
    assert.equal(sent.length, end);
    assert.equal(flow.acknowledge('alice', { t: 'http-ack', kind: 'http-response', id: 9, part: end - 1 }), true);
    await tick();
  }
  await running;
  assert.equal(sent.length, all.length);
  assert.equal(flow.waiting.size, 0);
});

test('missing acknowledgements fail closed without repeating a POST', async () => {
  const sent = [];
  const flow = new HttpFrameFlow({ send: (_peer, frame) => { sent.push(frame); return true; }, timeoutMs: 30 });
  await assert.rejects(flow.transfer('bob', httpFrames('http-request', 2, { method: 'POST' }, new Uint8Array(170_000))), /acknowledgement timed out/);
  assert.equal(sent.length, HTTP_WINDOW_FRAMES);
  assert.equal(flow.waiting.size, 0);
});

test('dropped peers stop pending transfers without retry', async () => {
  const sent = [];
  const flow = new HttpFrameFlow({ send: (_peer, frame) => { sent.push(frame); return true; } });
  const running = flow.transfer('alice', frames(3));
  flow.drop('alice');
  await assert.rejects(running, /peer disconnected/);
  assert.equal(flow.waiting.size, 0);
  assert.equal(sent.length, HTTP_WINDOW_FRAMES);
});

test('rejected transport send stops the transfer immediately', async () => {
  let delivered = 0;
  const flow = new HttpFrameFlow({ send: () => { delivered++; return delivered < 3; } });
  await assert.rejects(flow.transfer('alice', frames(4)), /transport disconnected/);
  assert.equal(delivered, 3);
  assert.equal(flow.waiting.size, 0);
});
