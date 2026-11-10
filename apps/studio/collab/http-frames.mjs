/** Small-binary-frame protocol for guest ↔ host HTTP, independent of the DOM. */
import { HTTP_LIMITS } from "./http-contract.mjs";

const CHUNK = 6 * 1024; // base64 fits under the 12 KiB WebRTC/relay frame budget
const MAX_PARTS = Math.ceil(HTTP_LIMITS.responseBytes / CHUNK) + 1;

function byteChunk(input) {
  return Uint8Array.from(atob(input), (c) => c.charCodeAt(0));
}

export function httpFrames(t, id, metadata, binary) {
  if (!["http-request", "http-response"].includes(t)) throw Error("Unsupported HTTP frame type");
  if (!Number.isSafeInteger(id) || id < 1) throw Error("Invalid HTTP request ID");
  if (!(binary instanceof Uint8Array) || binary.byteLength > HTTP_LIMITS.responseBytes) throw Error("HTTP frame body exceeds limit");
  const parts = Math.max(1, Math.ceil(binary.length / CHUNK));
  const frames = [];
  for (let i = 0; i < parts; i++) {
    const slice = binary.subarray(i * CHUNK, Math.min((i + 1) * CHUNK, binary.length));
    frames.push({
      t, id, part: i, parts, d: btoa(String.fromCharCode(...slice)),
      ...(i === 0 ? { meta: metadata } : {}),
    });
  }
  return frames;
}

export class HttpFrameCollector {
  constructor({ timeoutMs = HTTP_LIMITS.timeoutMs, maxPending = 4 } = {}) {
    this.timeoutMs = timeoutMs;
    this.maxPending = maxPending;
    this.pending = new Map();
  }
  accept(peer, frame) {
    if (!["http-request", "http-response"].includes(frame?.t)
      || !Number.isSafeInteger(frame.id) || frame.id < 1
      || !Number.isInteger(frame.parts) || frame.parts < 1 || frame.parts > MAX_PARTS
      || !Number.isInteger(frame.part) || frame.part < 0 || frame.part >= frame.parts
      || typeof frame.d !== "string" || frame.d.length > CHUNK * 2
      || (frame.part !== 0 && frame.meta !== undefined)) throw Error("Invalid HTTP frame");
    const key = [peer, frame.t, frame.id].join(":");
    let entry = this.pending.get(key);
    if (!entry) {
      if (this.pending.size >= this.maxPending) throw Error("Too many pending HTTP transfers");
      entry = { parts: Array(frame.parts), received: 0, bytes: 0, meta: undefined, expected: frame.parts };
      entry.timer = setTimeout(() => this.pending.delete(key), this.timeoutMs);
      entry.timer.unref?.();
      this.pending.set(key, entry);
    }
    if (entry.expected !== frame.parts) throw Error("Inconsistent HTTP transfer");
    if (entry.parts[frame.part]) throw Error("Duplicate HTTP frame");
    let bytes;
    try { bytes = byteChunk(frame.d); }
    catch (error) {
      clearTimeout(entry.timer);
      this.pending.delete(key);
      throw Error("Invalid HTTP frame encoding", { cause: error });
    }
    if (bytes.length > CHUNK || entry.bytes + bytes.length > HTTP_LIMITS.responseBytes) {
      clearTimeout(entry.timer);
      this.pending.delete(key);
      throw Error("HTTP transfer too large");
    }
    entry.parts[frame.part] = bytes;
    entry.received++;
    entry.bytes += bytes.length;
    if (frame.part === 0) entry.meta = frame.meta;
    if (entry.received < entry.expected) return null;
    clearTimeout(entry.timer);
    this.pending.delete(key);
    if (!entry.meta || typeof entry.meta !== "object") throw Error("HTTP metadata missing");
    const body = new Uint8Array(entry.bytes);
    let offset = 0;
    for (const chunk of entry.parts) { body.set(chunk, offset); offset += chunk.byteLength; }
    return { t: frame.t, id: frame.id, peer, meta: entry.meta, body };
  }
  reset() {
    for (const entry of this.pending.values()) clearTimeout(entry.timer);
    this.pending.clear();
  }
}
