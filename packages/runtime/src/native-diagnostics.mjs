/** madvise is an optional host memory hint, unavailable in the WASM address space.
 * Keep a counter for diagnostics, while leaving all other stderr visible.
 */
export function nativeDiagnostics(report = (text) => console.error(text)) {
  let memoryAdviceWarnings = 0;
  return {
    printErr(text) {
      if (
        /^warning: unsupported syscall: __syscall_madvise$/.test(
          String(text).trim(),
        )
      ) {
        memoryAdviceWarnings++;
        return;
      }
      report(text);
    },
    stats: () => ({ memoryAdviceWarnings }),
  };
}
