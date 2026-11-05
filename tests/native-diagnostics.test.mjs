import test from "node:test";
import assert from "node:assert/strict";
import { nativeDiagnostics } from "../packages/runtime/src/native-diagnostics.mjs";
test("only the known optional WASM memory advisory is counted instead of logged as an error", () => {
  const lines = [],
    d = nativeDiagnostics((text) => lines.push(text));
  d.printErr("warning: unsupported syscall: __syscall_madvise");
  d.printErr("fatal allocation error");
  d.printErr("warning: unsupported syscall: __syscall_unknown");
  assert.deepEqual(d.stats(), { memoryAdviceWarnings: 1 });
  assert.deepEqual(lines, [
    "fatal allocation error",
    "warning: unsupported syscall: __syscall_unknown",
  ]);
});
