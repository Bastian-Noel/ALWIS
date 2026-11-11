/** Share bounded request records, never PHP session or authorization headers. */
import { chunkText } from "./protocol.mjs";
const sensitive = /^(cookie|set-cookie|authorization|proxy-authorization)$/i;
export function shareNetworkRecord(record, send) {
  const copy = { ...record };
  for (const key of ["requestHeaders", "responseHeaders"])
    copy[key] = (record[key] ?? []).filter(([name]) => !sensitive.test(name));
  const text = JSON.stringify(copy);
  if (text.length > 200_000) return;
  const parts = chunkText(text), id = crypto.randomUUID();
  parts.forEach((d, part) => send({ t: "network-record", id, part, parts: parts.length, d }));
}
export function networkRecordReceiver(emit) {
  const pending = new Map();
  return message => {
    const { id, part, parts, d } = message;
    if (typeof id !== "string" || !Number.isInteger(parts) || parts < 1 || parts > 20
        || !Number.isInteger(part) || part < 0 || part >= parts || typeof d !== "string" || d.length > 12 * 1024) return false;
    if (!pending.has(id)) {
      if (pending.size >= 8) pending.delete(pending.keys().next().value);
      pending.set(id, { chunks: [], count: parts });
    }
    const entry = pending.get(id);
    if (entry.count !== parts) return false;
    entry.chunks[part] = d;
    if (entry.chunks.filter(x => x !== undefined).length !== parts) return false;
    pending.delete(id);
    try {
      const record = JSON.parse(entry.chunks.join(""));
      if (typeof record.id !== "string" || typeof record.path !== "string" || !Number.isFinite(record.status)) return false;
      emit(record); return true;
    } catch { return false; }
  };
}
