/** Per-guest fallback to script-free DOM snapshots when isolated HTTP fails. */
export class PreviewDelivery {
  #fallback = new Set();
  update(peer, { enabled, usable }) {
    if (typeof peer !== "string" || !peer) return false;
    if (!enabled) { this.#fallback.delete(peer); return false; }
    if (usable) this.#fallback.delete(peer);
    else this.#fallback.add(peer);
    return !usable;
  }
  targets(peerIds, enabled) {
    const online = [...peerIds];
    return enabled ? online.filter(peer => this.#fallback.has(peer)) : online;
  }
  drop(peer) { this.#fallback.delete(peer); }
  reset() { this.#fallback.clear(); }
}
