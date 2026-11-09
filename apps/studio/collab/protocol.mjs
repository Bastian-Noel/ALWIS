// Message vocabulary exchanged between host and guests (over WebRTC or the relay).
export const M = Object.freeze({
  HELLO: "hello", // guest -> host: { name, caps }
  TREE: "tree", // host -> guest: file list only (no content)
  OPEN: "open", // guest -> host: { path }  (lazy load)
  FILE: "file", // host -> guest: { path, text, version }
  OPS: "ops", // text deltas: { path, version, changes, cursor }
  ACK: "ack",
  AWARE: "aware", // ephemeral focus: cursor, cell, row, link, mouse…
  DB: "db", // database requests/responses (lazy)
  QUERY: "query", // shared SQL text + result
  PREVIEW: "preview", // pointer / click in the shared preview
  PING: "ping",
});

export const MAX_CHUNK = 12 * 1024; // chars per chunk on the relay; bigger payloads are split
export function chunkText(text, size = MAX_CHUNK) {
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out.length ? out : [""];
}

// Coalesce high-frequency ephemeral updates (cursors, mouse) so that only the
// latest state per key is sent at most every `ms` milliseconds.
export function createCoalescer(flush, ms = 60) {
  const pending = new Map();
  let timer = null;
  const run = () => {
    timer = null;
    if (!pending.size) return;
    const batch = [...pending.values()];
    pending.clear();
    flush(batch);
  };
  return {
    set(key, value) {
      pending.set(key, value);
      if (!timer) timer = setTimeout(run, ms);
    },
    flushNow() {
      clearTimeout(timer);
      run();
    },
    clear() {
      clearTimeout(timer);
      timer = null;
      pending.clear();
    },
  };
}
