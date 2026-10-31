/** Bounded source cache; the backing filesystem remains the source of truth. */
export class ByteLru {
  #entries = new Map();
  #bytes = 0;
  constructor(maxBytes = 4 * 1024 * 1024, maxEntries = 1024) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new RangeError('maxBytes');
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 0) throw new RangeError('maxEntries');
    this.maxBytes = maxBytes;
    this.maxEntries = maxEntries;
  }
  get bytes() { return this.#bytes; }
  get size() { return this.#entries.size; }
  get(key) {
    const value = this.#entries.get(key);
    if (value === undefined) return undefined;
    this.#entries.delete(key);
    this.#entries.set(key, value);
    return value.slice();
  }
  set(key, value) {
    if (!(value instanceof Uint8Array)) throw new TypeError('Uint8Array expected');
    this.delete(key);
    if (value.byteLength > this.maxBytes || this.maxBytes === 0 || this.maxEntries === 0) return false;
    while (this.#bytes + value.byteLength > this.maxBytes || this.size >= this.maxEntries) {
      this.delete(this.#entries.keys().next().value);
    }
    // Copy only the view, never retain an oversized source ArrayBuffer.
    const owned = value.slice();
    this.#entries.set(key, owned);
    this.#bytes += owned.byteLength;
    return true;
  }
  delete(key) {
    const value = this.#entries.get(key);
    if (value === undefined) return false;
    this.#bytes -= value.byteLength;
    return this.#entries.delete(key);
  }
  clear() { this.#entries.clear(); this.#bytes = 0; }
}
