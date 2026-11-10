/** Sliding-window flow control for binary HTTP frames over a budgeted relay/WebRTC link.
 * No HTTP request is replayed after a timeout; a missing ACK is a hard failure.
 */
import { HTTP_LIMITS } from './http-contract.mjs';

export const HTTP_WINDOW_FRAMES = 8; // at most 48 KiB of unacknowledged binary data per transfer
const TYPES = new Set(['http-request', 'http-response']);
const keyOf = (peer, kind, id) => JSON.stringify([peer, kind, id]);

export class HttpFrameFlow {
  constructor({ send, timeoutMs = HTTP_LIMITS.timeoutMs, windowFrames = HTTP_WINDOW_FRAMES }) {
    if (!Number.isSafeInteger(windowFrames) || windowFrames < 1 || windowFrames > HTTP_WINDOW_FRAMES)
      throw Error('Invalid HTTP window');
    this.send = send;
    this.timeoutMs = timeoutMs;
    this.windowFrames = windowFrames;
    this.waiting = new Map();
    this.closed = false;
  }
  async transfer(peer, frames) {
    if (this.closed) throw Error('HTTP connection closed');
    const first = frames?.[0];
    if (!first || !TYPES.has(first.t) || !Number.isSafeInteger(first.id) || first.id < 1)
      throw Error('Invalid HTTP transfer');
    const key = keyOf(peer, first.t, first.id);
    if (this.waiting.has(key)) throw Error('Duplicate HTTP transfer');
    for (let start = 0; start < frames.length; start += this.windowFrames) {
      if (this.closed) throw Error('HTTP connection closed');
      const end = Math.min(start + this.windowFrames, frames.length);
      await new Promise((resolve, reject) => {
        const entry = { endPart: end - 1, resolve, reject, timer: null };
        const fail = error => {
          if (this.waiting.get(key) !== entry) return;
          clearTimeout(entry.timer);
          this.waiting.delete(key);
          reject(error);
        };
        entry.timer = setTimeout(() => fail(Error('Remote HTTP transfer acknowledgement timed out')), this.timeoutMs);
        this.waiting.set(key, entry);
        try {
          for (let index = start; index < end; index++) {
            if (frames[index]?.id !== first.id || frames[index]?.t !== first.t || frames[index]?.part !== index)
              throw Error('Invalid HTTP frame sequence');
            if (this.send(peer, frames[index]) === false) throw Error('HTTP transport disconnected');
          }
        } catch (error) { fail(error); }
      });
    }
  }
  acknowledge(peer, message) {
    if (message?.t !== 'http-ack' || !TYPES.has(message.kind)) return false;
    const key = keyOf(peer, message.kind, message.id);
    const entry = this.waiting.get(key);
    if (!entry || entry.endPart !== message.part) return false;
    this.waiting.delete(key);
    clearTimeout(entry.timer);
    entry.resolve();
    return true;
  }
  abort(peer, kind, id, error = Error('HTTP transfer aborted')) {
    const key = keyOf(peer, kind, id);
    const entry = this.waiting.get(key);
    if (!entry) return;
    this.waiting.delete(key);
    clearTimeout(entry.timer);
    entry.reject(error);
  }
  drop(peer) {
    for (const key of [...this.waiting.keys()]) {
      const [target, kind, id] = JSON.parse(key);
      if (target === peer) this.abort(target, kind, id, Error('HTTP peer disconnected'));
    }
  }
  close() {
    this.closed = true;
    for (const key of [...this.waiting.keys()]) {
      const [peer, kind, id] = JSON.parse(key);
      this.abort(peer, kind, id, Error('HTTP connection closed'));
    }
  }
}

/** ACK only completed batches. The receiver must call this after validating each frame. */
export function frameNeedsAck(frame, windowFrames = HTTP_WINDOW_FRAMES) {
  return (frame.part + 1) % windowFrames === 0 || frame.part + 1 === frame.parts;
}
