/** Host-ordered table placement, independent of each participant's viewport. */
import { createCoalescer } from "./protocol.mjs";
const name = value => typeof value === "string" && value.length > 0 && value.length <= 64 && !/[\x00-\x1f]/.test(value);
export const validPlacement = m => !!m && name(m.db) && name(m.table)
  && Array.isArray(m.pos) && m.pos.length === 2 && m.pos.every(n => Number.isFinite(n) && Math.abs(n) <= 1e9);
export class SchemaSync {
  constructor({ host = false, send, apply, layouts }) {
    Object.assign(this, { host, send, apply, layouts });
    this.revision = 0;
    this.seen = new Map();
    this.pending = createCoalescer(batch => {
      for (const m of batch) this.host ? this.commit(m) : this.send({ t: "schema-move", ...m });
    }, 40);
  }
  move(db, table, pos, final = false) {
    const m = { db, table, pos: [...pos] };
    if (!validPlacement(m)) return;
    this.pending.set(JSON.stringify([db, table]), m);
    if (final) this.pending.flushNow();
  }
  commit(m) {
    if (!validPlacement(m)) return false;
    if (this.apply(m) === false) return false;
    this.send({ t: "schema-placement", db: m.db, table: m.table, pos: [...m.pos], revision: ++this.revision });
    return true;
  }
  receive(m) {
    if (this.host) return m.t === "schema-move" && this.commit(m);
    if (m.t !== "schema-placement" || !validPlacement(m) || !Number.isSafeInteger(m.revision) || m.revision < 0) return false;
    const key = JSON.stringify([m.db, m.table]);
    if (m.revision <= (this.seen.get(key) ?? -1)) return false;
    if (this.apply(m) === false) return false;
    this.seen.set(key, m.revision);
    return true;
  }
  snapshot(send) {
    this.pending.flushNow();
    for (const [db, positions] of Object.entries(this.layouts()))
      for (const [table, pos] of Object.entries(positions ?? {})) {
        const m = { t: "schema-placement", db, table, pos, revision: this.revision };
        if (validPlacement(m)) send(m);
      }
  }
  stop() { this.pending.clear(); }
}
