// Authority-based text synchronisation (the host is the authority).
// Only ChangeSet deltas travel; guests rebase their pending edits over remote ones.
import { ChangeSet, Text } from "@codemirror/state";

const LOG_LIMIT = 800;

/** Host side: ordered log of accepted updates for one document. */
export class HostLog {
  constructor(version = 0) {
    this.version = version; // number of updates ever accepted
    this.updates = []; // last LOG_LIMIT updates: { changes, id }
    this.first = version; // version of updates[0]
  }
  /** Record an edit already applied to the host document (host typing). */
  record(changes, id) {
    this.updates.push({ changes, id });
    this.version++;
    if (this.updates.length > LOG_LIMIT) {
      this.updates.splice(0, this.updates.length - LOG_LIMIT);
      this.first = this.version - this.updates.length;
    }
    return { version: this.version, id, changes: changes.toJSON() };
  }
  /**
   * Accept a guest update made on `version`. Returns the rebased ChangeSet to apply
   * to the host document (caller then calls `record`), or null => guest must resync.
   */
  rebase(version, changesJSON, docLength) {
    if (!Number.isInteger(version) || version > this.version || version < this.first) return null;
    let changes;
    try {
      changes = ChangeSet.fromJSON(changesJSON);
    } catch {
      return null;
    }
    for (let i = version - this.first; i < this.updates.length; i++) changes = changes.map(this.updates[i].changes);
    if (changes.length !== docLength) return null; // would corrupt: force a resync
    return changes;
  }
}

/** Guest side: pending edits + rebase of remote updates. Holds no text itself. */
export class GuestSync {
  constructor(id, version = 0) {
    this.id = id;
    this.version = version; // last confirmed authority version
    this.pending = []; // ChangeSets not yet confirmed (first may be in flight)
    this.inflight = false;
  }
  /** Register a local edit; returns a message to send now or null if one is already in flight. */
  local(changes) {
    this.pending.push(changes);
    return this.#flush();
  }
  #flush() {
    if (this.inflight || !this.pending.length) return null;
    this.inflight = true;
    this.sent = this.pending.reduce((a, b) => a.compose(b));
    this.sentCount = this.pending.length;
    return { version: this.version, changes: this.sent.toJSON() };
  }
  /** Re-send the in-flight message after a reconnect (host de-duplicates by version). */
  resend() {
    if (!this.inflight) return this.#flush();
    return { version: this.version, changes: this.sent.toJSON() };
  }
  /**
   * Handle an authority update. Returns { apply: ChangeSet|null, send: msg|null }.
   * `apply` must be dispatched to the local document (as a remote change).
   */
  receive(update) {
    if (update.version !== this.version + 1) return { gap: true };
    this.version = update.version;
    if (update.id === this.id) {
      // our in-flight edit was accepted: it equals `sentCount` pending edits
      this.pending.splice(0, this.sentCount);
      this.inflight = false;
      this.sent = null;
      return { apply: null, send: this.#flush() };
    }
    let remote = ChangeSet.fromJSON(update.changes);
    this.pending = this.pending.map((mine) => {
      const next = mine.map(remote);
      remote = remote.map(mine, true);
      return next;
    });
    if (this.inflight) {
      // `sent` was composed from the old pending; rebuild from mapped ones for consistency
      this.sent = this.pending.slice(0, this.sentCount).reduce((a, b) => a.compose(b));
    }
    return { apply: remote, send: null };
  }
}

export { ChangeSet, Text };
